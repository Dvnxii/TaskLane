// Single data layer shared by the REST routes and the agent's tool nodes.
import { db } from "./firebase.js";

const col = db.collection("tasks");
export const STATUSES = ["todo", "in_progress", "done"];

export async function list(uid) {
  const snap = await col.where("uid", "==", uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function create(uid, { title, dueDate = null }) {
  const task = { uid, title: title.trim(), status: "todo", dueDate, createdAt: Date.now() };
  const ref = await col.add(task);
  return { id: ref.id, ...task };
}

async function owned(uid, id) {
  const ref = col.doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid) return null;
  return ref;
}

export async function update(uid, id, patch) {
  const ref = await owned(uid, id);
  if (!ref) return null;
  const clean = {};
  if (patch.title) clean.title = patch.title.trim();
  if (STATUSES.includes(patch.status)) clean.status = patch.status;
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
  await ref.update(clean);
  return { id, ...(await ref.get()).data() };
}

export async function remove(uid, id) {
  const ref = await owned(uid, id);
  if (!ref) return false;
  await ref.delete();
  return true;
}

export async function findByTitle(uid, text = "") {
  const q = text.toLowerCase();
  const hits = (await list(uid)).filter((t) => t.title.toLowerCase().includes(q));
  return hits.find((t) => t.status !== "done") || hits[0] || null;
}

export const isOverdue = (t) =>
  t.status !== "done" && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
