// middleware/scheduler.ts
import type { Task as BaseTask } from "./task.ts";
import axios from "axios";

const tasks: Record<number, Task> = {};

// ---------------- Remote nodes ----------------
const remoteNodes = [
  { url: "http://192.168.0.101:4000", active: true },
  { url: "http://192.168.0.102:4000", active: true },
];

// ---------------- Task forwarding ----------------
async function forwardTaskToRemoteMachine(task: Task, remoteNode: { url: string; active: boolean }) {
  try {
    const res = await axios.post(`${remoteNode.url}/task`, {
      model: task.model,
      input: task.input,
      priority: task.priority,
    });
    console.log(`✅ Task ${task.id} forwarded to ${remoteNode.url}:`, res.data);
  } catch (err) {
    console.error(`❌ Failed to forward task ${task.id} to ${remoteNode.url}:`, err);
    remoteNode.active = false; // mark node inactive if failed
    // Optionally retry on another remote node
    const available = remoteNodes.filter((n) => n.active);
    if (available.length > 0) {
      await forwardTaskToRemoteMachine(task, available[0]);
    } else {
      console.log(`⚠️ All remote nodes unavailable, scheduling task locally.`);
      scheduleLocally(task); // fallback
    }
  }
}

// ---------------- Task & Node types ----------------
export type Task = BaseTask & {
  id: number;
  nodeId: number;
  type: "CPU" | "GPU";
  priority: number;
  status: "pending" | "running" | "finished" | "failed";
  startTime?: number;
  endTime?: number;
  result?: string;
  logs: string[];
};

let taskIdCounter = 0;

interface Node {
  id: number;
  cpuQueue: Task[];
  gpuQueue: Task[];
  runningCPU: Task[];
  runningGPU: Task[];
  maxCPU: number;
  maxGPU: number;
}

interface NodeQueue {
  runningCPU: number[];
  runningGPU: number[];
  pendingCPU: number[];
  pendingGPU: number[];
  recentFinished: number[];
}

// ---------------- Nodes ----------------
export const nodes: Node[] = [
  { id: 0, cpuQueue: [], gpuQueue: [], runningCPU: [], runningGPU: [], maxCPU: 2, maxGPU: 1 },
  { id: 1, cpuQueue: [], gpuQueue: [], runningCPU: [], runningGPU: [], maxCPU: 2, maxGPU: 1 },
];

const nodesStatus: Record<number, NodeQueue> = {};
nodes.forEach((n) => initNode(n.id));

export function initNode(nodeId: number) {
  nodesStatus[nodeId] = {
    runningCPU: [],
    runningGPU: [],
    pendingCPU: [],
    pendingGPU: [],
    recentFinished: [],
  };
}

// ---------------- Helpers ----------------
export function getQueueStatus() {
  return nodesStatus;
}

export function getAllTasks() {
  return tasks;
}

export function updateNodeQueue(
  nodeId: number,
  taskId: number,
  type: "CPU" | "GPU",
  action: "start" | "finish" | "enqueue"
) {
  const node = nodesStatus[nodeId];
  if (!node) return;

  if (action === "enqueue") {
    type === "CPU" ? node.pendingCPU.push(taskId) : node.pendingGPU.push(taskId);
  } else if (action === "start") {
    type === "CPU" ? node.runningCPU.push(taskId) : node.runningGPU.push(taskId);
    type === "CPU"
      ? (node.pendingCPU = node.pendingCPU.filter((id) => id !== taskId))
      : (node.pendingGPU = node.pendingGPU.filter((id) => id !== taskId));
  } else if (action === "finish") {
    type === "CPU"
      ? (node.runningCPU = node.runningCPU.filter((id) => id !== taskId))
      : (node.runningGPU = node.runningGPU.filter((id) => id !== taskId));
    node.recentFinished.push(taskId);
    setTimeout(() => {
      node.recentFinished = node.recentFinished.filter((id) => id !== taskId);
    }, 2000);
  }
}

function isGpuModel(model: string) {
  const gpuModels = ["transformer", "bert", "gpt", "vit", "llama"];
  return gpuModels.some((m) => model.toLowerCase().includes(m));
}

function isNodeOverloaded(node: Node, type: "CPU" | "GPU") {
  return type === "CPU" ? node.runningCPU.length >= node.maxCPU : node.runningGPU.length >= node.maxGPU;
}

// ---------------- Submit task ----------------
export async function submitTask(model: string, input: string, priority = 0): Promise<Task> {
  const taskType: "CPU" | "GPU" = isGpuModel(model) ? "GPU" : "CPU";

  const task: Task = {
    id: taskIdCounter++,
    model,
    input,
    nodeId: -1, // will assign later
    type: taskType,
    priority,
    status: "pending",
    target: model.toLowerCase().includes("gpu") ? "GPU" : "CPU",
    logs: [],
  };

  tasks[task.id] = task;

  // Pick least-loaded local node
  const node = nodes.reduce((best, current) => {
    const bestLoad = taskType === "GPU" ? best.gpuQueue.length : best.cpuQueue.length;
    const currLoad = taskType === "GPU" ? current.gpuQueue.length : current.cpuQueue.length;
    return currLoad < bestLoad ? current : best;
  });

  task.nodeId = node.id;

  // Forward if overloaded
  if (isNodeOverloaded(node, taskType) && remoteNodes.length > 0) {
    const available = remoteNodes.filter((n) => n.active);
    if (available.length > 0) {
      await forwardTaskToRemoteMachine(task, available[0]);
      return task;
    }
  }

  // Schedule locally
  scheduleLocally(task, node);
  return task;
}

// ---------------- Local scheduling ----------------
function scheduleLocally(task: Task, node?: Node) {
  node = node || nodes.find((n) => n.id === task.nodeId)!;

  if (task.type === "GPU") {
    node.gpuQueue.push(task);
    node.gpuQueue.sort((a, b) => b.priority - a.priority);
    updateNodeQueue(node.id, task.id, "GPU", "enqueue");
  } else {
    node.cpuQueue.push(task);
    node.cpuQueue.sort((a, b) => b.priority - a.priority);
    updateNodeQueue(node.id, task.id, "CPU", "enqueue");
  }

  processNodeTasks(node);
  printQueueSummary();
}

// ---------------- Processing ----------------
function processNodeTasks(node: Node) {
  node.cpuQueue.sort((a, b) => b.priority - a.priority);
  node.gpuQueue.sort((a, b) => b.priority - a.priority);

  while (node.runningCPU.length < node.maxCPU && node.cpuQueue.length > 0) {
    const task = node.cpuQueue.shift()!;
    task.status = "running";
    task.startTime = Date.now();
    task.logs.push(`[${new Date().toISOString()}] Running on CPU node ${node.id}`);
    node.runningCPU.push(task);
    updateNodeQueue(node.id, task.id, "CPU", "start");
    runCpuTask(task, node);
  }

  while (node.runningGPU.length < node.maxGPU && node.gpuQueue.length > 0) {
    const task = node.gpuQueue.shift()!;
    task.status = "running";
    task.startTime = Date.now();
    task.logs.push(`[${new Date().toISOString()}] Running on GPU node ${node.id}`);
    node.runningGPU.push(task);
    updateNodeQueue(node.id, task.id, "GPU", "start");
    runGpuTask(task, node);
  }

  nodesStatus[node.id].pendingCPU = node.cpuQueue.map((t) => t.id);
  nodesStatus[node.id].pendingGPU = node.gpuQueue.map((t) => t.id);
}

// ---------------- Run CPU/GPU tasks ----------------
function runCpuTask(task: Task, node: Node) {
  const logInterval = setInterval(() => task.logs.push(`[${new Date().toISOString()}] CPU task #${task.id} progress...`), 800);
  const duration = 3000 + Math.random() * 2000;

  setTimeout(() => {
    clearInterval(logInterval);
    task.endTime = Date.now();
    task.status = "finished";
    task.result = `Processed ${task.input} with ${task.model} on CPU in ${((task.endTime - task.startTime!) / 1000).toFixed(2)}s`;
    task.logs.push(`[${new Date().toISOString()}] Finished CPU task #${task.id}: ${task.result}`);
    node.runningCPU = node.runningCPU.filter((t) => t.id !== task.id);
    updateNodeQueue(node.id, task.id, "CPU", "finish");
    processNodeTasks(node);
    printQueueSummary();
    onTaskUpdate?.(task);
  }, duration);
}

function runGpuTask(task: Task, node: Node) {
  const logInterval = setInterval(() => task.logs.push(`[${new Date().toISOString()}] GPU task #${task.id} progress...`), 600);
  const duration = 2000 + Math.random() * 1500;

  setTimeout(() => {
    clearInterval(logInterval);
    task.endTime = Date.now();
    task.status = "finished";
    task.result = `Processed ${task.input} with ${task.model} on GPU in ${((task.endTime - task.startTime!) / 1000).toFixed(2)}s`;
    task.logs.push(`[${new Date().toISOString()}] Finished GPU task #${task.id}: ${task.result}`);
    node.runningGPU = node.runningGPU.filter((t) => t.id !== task.id);
    updateNodeQueue(node.id, task.id, "GPU", "finish");
    processNodeTasks(node);
    printQueueSummary();
    onTaskUpdate?.(task);
  }, duration);
}

// ---------------- Task update hook ----------------
export let onTaskUpdate: ((task: Task) => void) | null = null;
export function setTaskUpdateHook(fn: (task: Task) => void) {
  onTaskUpdate = fn;
}

// ---------------- Print ----------------
function printQueueSummary() {
  console.log("📊 Task Queue Status:");
  nodes.forEach((node) => {
    console.log(`- Node ${node.id} Running CPU: [${node.runningCPU.map((t) => t.id)}]`);
    console.log(`- Node ${node.id} Running GPU: [${node.runningGPU.map((t) => t.id)}]`);
    console.log(`- Node ${node.id} Pending CPU: [${node.cpuQueue.map((t) => t.id)}]`);
    console.log(`- Node ${node.id} Pending GPU: [${node.gpuQueue.map((t) => t.id)}]`);
    console.log(`- Node ${node.id} Finished: [${nodesStatus[node.id].recentFinished.join(",")}]`);
  });
  console.log("-----------------------------------");
}
