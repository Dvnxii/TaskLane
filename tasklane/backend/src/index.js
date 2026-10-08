import express from "express";
import { auth } from "./firebase.js";
import * as tasks from "./tasks.js";
import { graph } from "./agent.js";

const app = express();
app.use(express.json());

async function requireUser(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    req.uid = (await auth.verifyIdToken(token)).uid;
    next();
  } catch {
    res.status(401).json({ error: "Sign in to continue." });
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", requireUser);

app.get("/api/tasks", async (req, res) => res.json(await tasks.list(req.uid)));

app.post("/api/tasks", async (req, res) => {
  const { title, dueDate } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required." });
  res.status(201).json(await tasks.create(req.uid, { title, dueDate: dueDate || null }));
});

app.patch("/api/tasks/:id", async (req, res) => {
  const t = await tasks.update(req.uid, req.params.id, req.body);
  t ? res.json(t) : res.status(404).json({ error: "Task not found." });
});

app.delete("/api/tasks/:id", async (req, res) => {
  (await tasks.remove(req.uid, req.params.id)) ? res.status(204).end() : res.status(404).json({ error: "Task not found." });
});

// Agent: runs the LangGraph and reports which nodes executed.
app.post("/api/agent", async (req, res) => {
  const message = req.body.message?.trim();
  if (!message) return res.status(400).json({ error: "Message is required." });
  try {
    const trace = [];
    let reply = "";
    const stream = await graph.stream(
      { uid: req.uid, input: message },
      { configurable: { thread_id: req.uid }, streamMode: "updates" }
    );
    for await (const chunk of stream) {
      for (const [node, update] of Object.entries(chunk)) {
        trace.push(node);
        if (update?.reply) reply = update.reply;
      }
    }
    res.json({ reply, trace });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "The agent failed. Try again." });
  }
});

app.listen(process.env.PORT || 8080, () => console.log("Tasklane API up"));
