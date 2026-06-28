import type { Edge, Node } from "reactflow";

export type PortKind = "text" | "image" | "any" | "result";
export type NodeKind = "request" | "crop" | "gemini" | "response";
export type RunStatus = "idle" | "running" | "success" | "error";

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
  status: "pending" | "running" | "success" | "failed" | "partial";
  duration: string;
  output: string;
};

export type HistoryRunScopeLabel = "Full Workflow" | "Multi-select" | "Single Node";

export type HistoryRun = {
  id: string;
  scope: HistoryRunScopeLabel;
  status: "pending" | "running" | "success" | "failed" | "partial";
  startedAt: string;
  completedAt?: string;
  duration: string;
  nodes: HistoryNode[];
};

export type PersistedRun = {
  scope: "full" | "partial" | "single";
  status: "pending" | "running" | "success" | "failed" | "partial";
  startedAt: string;
  completedAt: string;
  nodes: HistoryNode[];
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
