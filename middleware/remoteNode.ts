import express from "express";
import bodyParser from "body-parser";
import WebSocket from "ws";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;
const SERVER_URL = process.env.SERVER_URL || "ws://localhost:3000"; // connect to central server

// Connect to main middleware server
const ws = new WebSocket(SERVER_URL);

ws.on("open", () => {
  console.log(`🔗 Connected to middleware server (${SERVER_URL})`);
  ws.send(JSON.stringify({ type: "registerNode", port: PORT }));
});

// When the server sends a task to this remote node
ws.on("message", async (msg) => {
  const data = JSON.parse(msg.toString());

  if (data.type === "runTask") {
    const { taskId, model, input, target } = data;
    console.log(`⚙️ Running task ${taskId} (${model}) on ${target}...`);

    // Simulate task progress
    for (let progress = 0; progress <= 100; progress += 20) {
      await new Promise((r) => setTimeout(r, 500));
      ws.send(JSON.stringify({ type: "progress", taskId, progress }));
    }

    // Simulate completion
    const result = `✅ Result for ${model} (${input}) on ${target}`;
    ws.send(JSON.stringify({ type: "taskDone", taskId, result }));

    console.log(`✅ Task ${taskId} completed`);
  }
});

ws.on("close", () => console.log("❌ Lost connection to middleware server"));
ws.on("error", (err) => console.error("WS Error:", err.message));

app.listen(PORT, () => {
  console.log(`🚀 Remote node running on port ${PORT}`);
});
