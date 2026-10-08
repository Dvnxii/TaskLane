# Tasklane

Tasklane is a task management application where users can create and manage tasks using normal language instead of manually filling out forms.

For example, you can type:

```text
mark login bug done
what's overdue?
summarize this sprint
```

A LangGraph agent interprets the command and performs the required operation in Firestore.

The project uses Firebase for authentication and data storage, with an Express/Node backend and a React frontend. The application can be deployed using Google Cloud Run and Firebase Hosting.

## How It Works

The overall flow looks like this:

```text
React (Vite)
     │
     ▼
  /api/*
     │
     ▼
Express API (Cloud Run)
     │
     ▼
LangGraph Agent
     │
     ▼
Firestore
```

Firestore also provides real-time updates to the frontend using `onSnapshot`.

```text
Firestore ──────► React
       onSnapshot
```

This means that when task data changes, the UI can update without manually refreshing the page.

## LangGraph Agent

The agent uses a small graph to decide what to do with each user command.

```text
START
  │
  ▼
router
  ├── create ───► create_task ──┐
  ├── update ───► update_task ──┤
  ├── query ────► query_tasks ──┤
  ├── summarize ► summarize ────┤
  └── chat ─────► chat ─────────┤
                                ▼
                             remember
                                │
                                ▼
                               END
```

### Router

The router uses an LLM with structured output to identify what the user wants to do.

It can extract information such as:

- Task title
- Due date
- Status
- Filters

Based on the detected intent, the graph sends the request to the appropriate node.

### Task Nodes

There are five main paths:

- `create_task` — creates a new task
- `update_task` — changes an existing task
- `query_tasks` — finds tasks based on a query
- `summarize` — summarizes the current sprint/tasks
- `chat` — handles normal conversation

These nodes use the same `tasks.js` layer that is used by the REST API.

### Memory

The `remember` node adds the current conversation turn to the agent state.

A `MemorySaver` checkpointer is used to keep the state associated with the user.

For a production setup, this can be replaced with a Firestore or PostgreSQL-based checkpointer.

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express |
| Agent | LangGraph |
| Authentication | Firebase Auth |
| Database | Firestore |
| Deployment | Google Cloud Run |
| Frontend Hosting | Firebase Hosting |

## Running Locally

### 1. Firebase Setup

Create a Firebase project and enable:

- Authentication → Google
- Firestore

### 2. Backend

Go to the backend directory:

```bash
cd backend
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Add the required values, including:

```env
ANTHROPIC_API_KEY=your_key
GOOGLE_CLOUD_PROJECT=your_project_id
```

Authenticate with Google Cloud:

```bash
gcloud auth application-default login
```

Start the backend:

```bash
npm run dev
```

The backend runs on:

```text
http://localhost:8080
```

### 3. Frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
cp .env.example .env
```

Add your Firebase web configuration to the file.

Start the frontend:

```bash
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

The Vite development server proxies `/api` requests to the backend.

### 4. Firestore Rules

Deploy the Firestore security rules using:

```bash
firebase deploy --only firestore:rules
```

## Deploying to GCP

### Backend — Cloud Run

From the backend directory:

```bash
cd backend

gcloud run deploy tasklane-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<project-id> \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest
```

### Frontend — Firebase Hosting

Build the frontend:

```bash
cd ../frontend
npm install
npm run build
```

Then deploy:

```bash
cd ..
firebase deploy --only hosting
```

The Firebase Hosting configuration rewrites `/api/*` requests to the Cloud Run backend.

## Authentication

Although Cloud Run is configured with:

```text
--allow-unauthenticated
```

the API itself still checks the Firebase ID token on every request.

So the setting allows requests to reach the Cloud Run service, but users still need a valid Firebase authentication token to use the API.

## Real-Time Updates

Tasklane uses Firestore's `onSnapshot` listener for task updates.

The basic flow is:

```text
User changes a task
       ↓
Firestore
       ↓
onSnapshot
       ↓
React UI updates
```

This keeps the task list synchronized without requiring a page refresh.

## Project Structure

A simplified structure is:

```text
tasklane/
├── backend/
│   ├── ...
│   └── package.json
│
├── frontend/
│   ├── ...
│   └── package.json
│
└── README.md
```

The backend contains the Express API and LangGraph agent, while the frontend contains the React/Vite application.

## Example Commands

Some examples of commands that can be given to the agent:

```text
Create a task to fix the login bug

Mark the login bug as done

What tasks are overdue?

Show me the tasks assigned to me

Summarize this sprint
```

The router decides which part of the agent graph should handle each command.

## Resume Version

- Built Tasklane, a full-stack task tracker using React, Express, Firebase Auth, and Firestore, deployed on Google Cloud Run and Firebase Hosting with authenticated REST APIs and real-time Firestore updates.
- Designed a LangGraph-based agent with an LLM intent router, conditional task operations, and per-user memory to convert natural-language commands into Firestore operations.

## License

MIT