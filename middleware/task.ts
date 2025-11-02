export interface Task {
  id: number;
  model: string;
  input: string;
  priority: number;
  target: "CPU" | "GPU";
  status: "pending" | "running" | "finished" | "failed";
  progress?: number; // ✅ new field for progress percentage (0–100)
  result?: string;
  startedAt?: number;
  finishedAt?: number;
}
