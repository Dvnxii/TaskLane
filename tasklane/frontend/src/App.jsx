import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db, google } from "./firebase.js";

async function api(path, { method = "GET", body } = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body && JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

const today = () => new Date().toISOString().slice(0, 10);
const NEXT = { todo: "in_progress", in_progress: "done", done: "todo" };
const LABEL = { todo: "To do", in_progress: "In progress", done: "Done" };
const SUGGESTIONS = ["What's overdue?", "Add 'Write release notes' due tomorrow", "Summarize this sprint"];

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return null;
  if (!user)
    return (
      <main className="signin">
        <h1>Tasklane</h1>
        <p>Track work and run it with plain-language commands.</p>
        <button className="primary" onClick={() => signInWithPopup(auth, google)}>Sign in with Google</button>
      </main>
    );
  return <Board user={user} />;
}

function Board({ user }) {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");

  // Live sync: agent and REST writes both show up here.
  useEffect(() => {
    const q = query(collection(db, "tasks"), where("uid", "==", user.uid));
    return onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((a.dueDate || "9") < (b.dueDate || "9") ? -1 : 1)))
    );
  }, [user.uid]);

  const run = async (fn) => {
    setError("");
    try { await fn(); } catch (e) { setError(e.message); }
  };
  const add = () => title.trim() && run(async () => {
    await api("/tasks", { method: "POST", body: { title, dueDate: due || null } });
    setTitle(""); setDue("");
  });

  return (
    <div className="shell">
      <header>
        <h1>Tasklane</h1>
        <span>{user.displayName}</span>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </header>

      <section className="tasks">
        <div className="add">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a task" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <button className="primary" onClick={add}>Add task</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {items.length === 0 && <p className="empty">No tasks yet. Add one above, or tell the assistant what to track.</p>}
        <ul>
          {items.map((t) => {
            const late = t.status !== "done" && t.dueDate && t.dueDate < today();
            return (
              <li key={t.id} className={t.status}>
                <button className={`pill ${t.status}`} onClick={() => run(() => api(`/tasks/${t.id}`, { method: "PATCH", body: { status: NEXT[t.status] } }))}>
                  {LABEL[t.status]}
                </button>
                <span className="name">{t.title}</span>
                {t.dueDate && <span className={late ? "due late" : "due"}>{late ? "Overdue · " : "Due "}{t.dueDate}</span>}
                <button className="ghost" onClick={() => run(() => api(`/tasks/${t.id}`, { method: "DELETE" }))}>Delete</button>
              </li>
            );
          })}
        </ul>
      </section>

      <Assistant />
    </div>
  );
}

function Assistant() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs]);

  const send = async (message) => {
    if (!message.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setText(""); setBusy(true);
    try {
      const { reply, trace } = await api("/agent", { method: "POST", body: { message } });
      setMsgs((m) => [...m, { role: "assistant", text: reply, trace }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: e.message, error: true }]);
    }
    setBusy(false);
  };

  return (
    <aside className="assistant">
      <h2>Assistant</h2>
      <div className="log">
        {msgs.length === 0 && SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? "error" : ""}`}>
            <p>{m.text}</p>
            {m.trace && <small className="trace">{m.trace.join(" › ")}</small>}
          </div>
        ))}
        {busy && <div className="msg assistant"><p>Working on it…</p></div>}
        <div ref={end} />
      </div>
      <div className="ask">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(text)} placeholder="Mark the login bug done" />
        <button className="primary" onClick={() => send(text)} disabled={busy}>Send</button>
      </div>
    </aside>
  );
}
