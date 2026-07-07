import type { Edge, Node } from "reactflow";

export type PortKind = "text" | "image" | "number" | "any" | "result";
export type NodeKind = "request" | "crop" | "gemini" | "response";
export type RunStatus = "idle" | "running" | "success" | "error";
export type PersistedStatus = "pending" | "running" | "success" | "failed" | "partial";

export type FlowNodeData = {
  title: string;
  kind: NodeKind;
  fixed?: boolean;
  status?: RunStatus;
  duration?: string;
  fields?: string[];
  systemPrompt?: string;
  prompt?: string;
  output?: string;
  /** Base64 data URL for the Request-Inputs image_field, consumed downstream like `output` (text_field). */
  imageData?: string;
  runOutput?: string;
  runError?: string;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<{ kind: PortKind }>;

export type Snapshot = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type HistoryNode = {
  id: string;
  title: string;
  type?: string;
  status: PersistedStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs: number | null;
  output: string;
  error?: string | null;
};

export type HistoryRun = {
  id: string;
  scope: "full" | "partial" | "single";
  status: PersistedStatus;
  startedAt: string;
  startedAtLabel: string;
  completedAt: string | null;
  durationMs: number | null;
  nodeCount: number;
  nodes: HistoryNode[];
};

export type PersistedNodeRun = {
  id: string;
  title: string;
  type: NodeKind;
  status: PersistedStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  output: string;
};

export type PersistedRun = {
  scope: "full" | "partial" | "single";
  status: PersistedStatus;
  startedAt: string;
  completedAt: string;
  nodes: PersistedNodeRun[];
};

export const RUNTIME_NODE_DATA_KEYS = ["status", "duration", "runOutput", "runError"] as const;

export function sanitizeNodesForPersistence(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => {
    const configData = { ...node.data };
    delete configData.status;
    delete configData.duration;
    delete configData.runOutput;
    delete configData.runError;

    return {
      ...node,
      data: configData,
    };
  });
}

export function normalizeRunStatus(status?: string): RunStatus {
  if (status === "running" || status === "success" || status === "error") return status;
  if (status === "failed") return "error";
  if (status === "queued") return "running";
  return "idle";
}
