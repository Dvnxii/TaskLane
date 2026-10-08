import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import * as tasks from "./tasks.js";

const llm = new ChatAnthropic({
  model: process.env.MODEL || "claude-haiku-4-5-20251001",
  temperature: 0,
});

const Route = z.object({
  intent: z.enum(["create", "update", "query", "summarize", "chat"]),
  title: z.string().optional().describe("New task title, or the title of the task being changed"),
  dueDate: z.string().optional().describe("YYYY-MM-DD, resolved from today's date"),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  filter: z.enum(["all", "open", "overdue", "done"]).optional(),
});

const State = Annotation.Root({
  uid: Annotation(),
  input: Annotation(),
  route: Annotation(),
  reply: Annotation(),
  // Conversation memory, persisted per user by the checkpointer.
  messages: Annotation({ reducer: (a, b) => a.concat(b).slice(-12), default: () => [] }),
});

const line = (t) => `- ${t.title} (${t.status}${t.dueDate ? `, due ${t.dueDate}` : ""})`;

async function router(s) {
  const today = new Date().toISOString().slice(0, 10);
  const history = s.messages.slice(-6).map((m) => `${m.role}: ${m.text}`).join("\n");
  const route = await llm.withStructuredOutput(Route).invoke([
    ["system", `You route commands for a task tracker. Today is ${today}.\nRecent chat:\n${history || "(none)"}`],
    ["human", s.input],
  ]);
  return { route };
}

async function createTask(s) {
  const { title, dueDate } = s.route;
  if (!title) return { reply: "What should the task be called?" };
  const t = await tasks.create(s.uid, { title, dueDate: dueDate ?? null });
  return { reply: `Added "${t.title}"${t.dueDate ? `, due ${t.dueDate}` : ""}.` };
}

async function updateTask(s) {
  const { title, status, dueDate } = s.route;
  const match = await tasks.findByTitle(s.uid, title);
  if (!match) return { reply: `I couldn't find a task matching "${title ?? ""}".` };
  const t = await tasks.update(s.uid, match.id, { status: status ?? (dueDate ? undefined : "done"), dueDate });
  return { reply: `Updated "${t.title}": ${t.status}${t.dueDate ? `, due ${t.dueDate}` : ""}.` };
}

async function queryTasks(s) {
  const f = s.route.filter ?? "open";
  const rows = (await tasks.list(s.uid)).filter((t) =>
    f === "all" ? true : f === "done" ? t.status === "done" : f === "overdue" ? tasks.isOverdue(t) : t.status !== "done"
  );
  return { reply: rows.length ? `${f} tasks:\n${rows.map(line).join("\n")}` : `No ${f} tasks.` };
}

async function summarize(s) {
  const all = await tasks.list(s.uid);
  if (!all.length) return { reply: "There are no tasks yet." };
  const today = new Date().toISOString().slice(0, 10);
  const res = await llm.invoke([
    ["system", "Summarize this task list for a standup in under 80 words: progress, what is overdue, what to do next."],
    ["human", `Today: ${today}\n${all.map(line).join("\n")}`],
  ]);
  return { reply: res.content.toString() };
}

async function chat(s) {
  const res = await llm.invoke([
    ["system", "You are Tasklane's assistant. Answer briefly. You can add tasks, update them, list them and summarize them."],
    ["human", s.input],
  ]);
  return { reply: res.content.toString() };
}

async function remember(s) {
  return { messages: [{ role: "user", text: s.input }, { role: "assistant", text: s.reply }] };
}

export const graph = new StateGraph(State)
  .addNode("router", router)
  .addNode("create_task", createTask)
  .addNode("update_task", updateTask)
  .addNode("query_tasks", queryTasks)
  .addNode("summarize", summarize)
  .addNode("chat", chat)
  .addNode("remember", remember)
  .addEdge(START, "router")
  .addConditionalEdges("router", (s) => s.route.intent, {
    create: "create_task",
    update: "update_task",
    query: "query_tasks",
    summarize: "summarize",
    chat: "chat",
  })
  .addEdge("create_task", "remember")
  .addEdge("update_task", "remember")
  .addEdge("query_tasks", "remember")
  .addEdge("summarize", "remember")
  .addEdge("chat", "remember")
  .addEdge("remember", END)
  .compile({ checkpointer: new MemorySaver() });
