// server.ts
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import {
  getQueueStatus,
  submitTask,
  nodes,
  getAllTasks,
  setTaskUpdateHook,
  initNode,
} from "./middleware/scheduler.ts";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// --- Initialize nodes ---
nodes.forEach((n) => initNode(n.id));

// --- HTTP routes ---
app.get("/queue", (req, res) => res.json(getQueueStatus()));

app.get("/tasks", (req, res) => res.json(getAllTasks()));

app.get("/task/:id", (req, res) => {
  const id = Number(req.params.id);
  const task = getAllTasks()[id];
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

app.post("/submit-task", async (req, res) => {
  const { model, input, priority } = req.body;
  if (!model || !input)
    return res.status(400).json({ error: "model and input required" });

  try {
    const task = await submitTask(model, input, priority || 0);
    console.log(`📥 Task submitted: ${task.model} → ${task.target}`);
    broadcastAll(); // notify clients immediately
    res.json(task);
  } catch (err) {
    console.error("❌ Task submission failed:", err);
    res.status(500).json({ error: "submit failed" });
  }
});

// --- Create HTTP + WS server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Helper: broadcast all queues + tasks ---
function broadcastAll() {
  const payload = {
    queues: getQueueStatus(),
    tasks: getAllTasks(),
    timestamp: Date.now(),
  };
  const data = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(data);
  });
}

// --- Hook: called whenever a task changes (progress/status/result) ---
setTaskUpdateHook((task) => {
  console.log(
    `📡 Task update [${task.id}] ${task.model} — ${task.status} (${task.progress || 0}%)`
  );
  broadcastAll();
});

// --- Periodic broadcast for new clients (every 2s) ---
setInterval(() => broadcastAll(), 2000);

// --- WS connection handling ---
wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  // send immediate snapshot
  ws.send(
    JSON.stringify({
      queues: getQueueStatus(),
      tasks: getAllTasks(),
      timestamp: Date.now(),
    })
  );

  ws.on("close", () => console.log("❎ WebSocket client disconnected"));
  ws.on("error", (err) => console.error("⚠️ WS error:", err));
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`🚀 Server HTTP+WS running on http://localhost:${PORT} (WS on same port)`);
});
