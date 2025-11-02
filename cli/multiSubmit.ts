import { submitTask, getQueueStatus } from "../middleware/scheduler.ts";

console.log("🚀 Submitting multiple mixed tasks to multiple nodes...\n");

// Define a mix of CPU and GPU tasks
const tasks: [string, string][] = [
  ["resnet50", "image1.jpg"],      // CPU
  ["mobilenet", "image2.jpg"],     // CPU
  ["transformer", "image3.jpg"],   // GPU
  ["bert", "image4.jpg"],          // GPU
  ["vit", "image5.jpg"],           // GPU
  ["alexnet", "image6.jpg"],       // CPU
  ["llama", "image7.jpg"]          // GPU
];

// Function to print a clean visual queue
function printQueue() {
  const status = getQueueStatus();
  console.clear();
  console.log("📊 Task Queue Status (All Nodes):\n");
  for (const node of Object.keys(status)) {
    const n = status[node as unknown as number];
    console.log(`Node ${node}:`);
    console.log(`  Running CPU Task: ${n.runningCPU ?? "None"}`);
    console.log(`  Running GPU Task: ${n.runningGPU ?? "None"}`);
    console.log(`  Pending CPU Tasks: [${n.pendingCPU.join(", ")}]`);
    console.log(`  Pending GPU Tasks: [${n.pendingGPU.join(", ")}]`);
    console.log("-----------------------------------");
  }
}

// Auto-refresh the queue every 0.5s
const queueInterval = setInterval(printQueue, 500);

// Submit tasks with slight delays
tasks.forEach(([model, input], index) => {
  setTimeout(async () => {
    await submitTask(model, input);
  }, index * 300);
});

// Stop auto-refresh when all tasks are done
async function monitorCompletion() {
  while (true) {
    const status = getQueueStatus();
    const allEmpty = Object.values(status).every(
      n => !n.runningCPU && !n.runningGPU && n.pendingCPU.length === 0 && n.pendingGPU.length === 0
    );
    if (allEmpty) break;
    await new Promise(res => setTimeout(res, 500));
  }
  clearInterval(queueInterval);
  printQueue();
  console.log("✅ All tasks completed!");
}

monitorCompletion();
