import { useEffect, useState } from "react";

type NodeQueue = {
  runningCPU: number[];
  runningGPU: number[];
  pendingCPU: number[];
  pendingGPU: number[];
  recentFinished: number[];
};

type Task = {
  id: number;
  model: string;
  input: string;
  nodeId: number;
  type: "CPU" | "GPU";
  priority: number;
  status: "pending" | "running" | "finished" | "failed";
  startTime?: number;
  endTime?: number;
  result?: string;
  logs: string[];
};

type Payload = {
  queues: Record<string, NodeQueue>;
  tasks: Record<number, Task>;
  timestamp: number;
};

function TaskForm({ onSubmit }: { onSubmit: (t: Task) => void }) {
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !input) return;
    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:3000/submit-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input, priority }),
      });
      const t = await res.json();
      onSubmit(t);
      setModel("");
      setInput("");
      setPriority(0);
    } catch (err) {
      console.error(err);
      alert("Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col md:flex-row gap-2 mb-4">
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="Model (e.g., resnet50)"
        className="border p-2 rounded flex-1"
        disabled={submitting}
      />
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Input (e.g., image1.jpg)"
        className="border p-2 rounded flex-1"
        disabled={submitting}
      />
      <select
        value={priority}
        onChange={(e) => setPriority(Number(e.target.value))}
        className="border p-2 rounded"
      >
        <option value={0}>Low</option>
        <option value={1}>Medium</option>
        <option value={2}>High</option>
      </select>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded"
        disabled={submitting}
      >
        {submitting ? "Submitting..." : "Submit Task"}
      </button>
    </form>
  );
}

function NodeCard({
  nodeId,
  node,
  tasks,
  onOpen,
}: {
  nodeId: string;
  node: NodeQueue;
  tasks: Record<number, Task>;
  onOpen: (t: Task) => void;
}) {
  const recent = node.recentFinished.map((id) => tasks[id]).filter(Boolean);
  return (
    <div className="p-4 border rounded shadow bg-white">
      <h3 className="font-bold mb-2">Node {nodeId}</h3>
      <div className="text-sm mb-2">
        <div>Running CPU: {node.runningCPU.length ? node.runningCPU.join(", ") : "None"}</div>
        <div>Running GPU: {node.runningGPU.length ? node.runningGPU.join(", ") : "None"}</div>
        <div>Pending CPU: {node.pendingCPU.length ? node.pendingCPU.join(", ") : "None"}</div>
        <div>Pending GPU: {node.pendingGPU.length ? node.pendingGPU.join(", ") : "None"}</div>
      </div>

      <div>
        <div className="font-semibold">Recently finished</div>
        {recent.length ? (
          <ul className="text-sm">
            {recent.map((t) => (
              <li key={t.id}>
                <button
                  className="underline text-blue-600"
                  onClick={() => onOpen(t)}
                >
                  #{t.id}
                </button>{" "}
                — {t.type} {t.model} ({t.input}) —{" "}
                {t.result ? (
                  <span className="text-green-600">done</span>
                ) : (
                  "done"
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-400 text-sm">None</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [queues, setQueues] = useState<Record<string, NodeQueue>>({});
  const [tasks, setTasks] = useState<Record<number, Task>>({});
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  //const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    console.log(recentTasks)
    const ws = new WebSocket("ws://localhost:3000");
    ws.onopen = () => console.log("✅ WebSocket connected");
    ws.onclose = () => console.log("❌ WebSocket closed");
    ws.onmessage = (e) => {
      const p: Payload = JSON.parse(e.data);
      setQueues(p.queues);
      setTasks(p.tasks);
      if (selected && p.tasks[selected.id]) {
        setSelected(p.tasks[selected.id]);
      }
    };
    return () => ws.close();
  }, [selected]);

  const openTask = (t: Task) => setSelected(t);
  const closeTask = () => setSelected(null);

  const handleSubmit = (t: Task) => {
    setRecentTasks((prev) => [...prev, t].slice(-10));
    //setToast(`Task #${t.id} (${t.model}) submitted`);
    //setTimeout(() => setToast(null), 2000);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">AI Task Queue (Realtime)</h1>
      <TaskForm onSubmit={handleSubmit} />

      {/* {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow">
          {toast}
        </div>
      )} */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(queues).map(([id, node]) => (
          <NodeCard key={id} nodeId={id} node={node} tasks={tasks} onOpen={openTask} />
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-[90%] max-w-2xl">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold">
                Task #{selected.id} — {selected.model}
              </h2>
              <button onClick={closeTask} className="text-sm text-gray-600">
                Close
              </button>
            </div>
            <div className="mb-2">
              <div>
                <strong>Status:</strong> {selected.status}
              </div>
              <div>
                <strong>Node:</strong> {selected.nodeId}
              </div>
              <div>
                <strong>Type:</strong> {selected.type}
              </div>
              <div>
                <strong>Priority:</strong> {selected.priority}
              </div>
              {selected.result && (
                <div className="mt-2">
                  <strong>Result:</strong>
                  <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-2 rounded">
                    {selected.result}
                  </pre>
                </div>
              )}
            </div>
            <div>
              <div className="font-semibold mb-1">Logs:</div>
              <div className="max-h-64 overflow-auto bg-gray-50 p-2 rounded">
                {selected.logs.length ? (
                  selected.logs.map((l, i) => (
                    <div key={i} className="text-xs">
                      {l}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400">No logs</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
