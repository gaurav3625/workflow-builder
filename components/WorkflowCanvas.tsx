"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow";

import "reactflow/dist/style.css";

type PortKind = "text" | "image" | "any" | "result";
type NodeKind = "request" | "crop" | "gemini" | "response";
type RunStatus = "idle" | "queued" | "running" | "success" | "failed";

type FlowNodeData = {
  title: string;
  kind: NodeKind;
  fixed?: boolean;
  status?: RunStatus;
  duration?: string;
  fields?: string[];
  systemPrompt?: string;
  prompt?: string;
  output?: string;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<{ kind: PortKind }>;

type Snapshot = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

type HistoryNode = {
  id: string;
  title: string;
  status: "pending" | "running" | "success" | "failed" | "partial";
  duration: string;
  output: string;
};

type HistoryRunScopeLabel = "Full Workflow" | "Multi-select" | "Single Node";

type HistoryRun = {
  id: string;
  scope: HistoryRunScopeLabel;
  status: "pending" | "running" | "success" | "failed" | "partial";
  startedAt: string;
  duration: string;
  nodes: HistoryNode[];
};

type PersistedRun = {
  scope: "full" | "partial" | "single";
  status: "pending" | "running" | "success" | "failed" | "partial";
  nodes: HistoryNode[];
};

const REQUIRED_NODE_IDS = new Set(["request-inputs", "response"]);

const PORT_TYPES: Record<string, PortKind> = {
  "request-inputs:text_field": "text",
  "request-inputs:image_field": "image",
  "crop-1:input-image": "image",
  "crop-1:output-image": "image",
  "crop-2:input-image": "image",
  "crop-2:output-image": "image",
  "gemini-1:prompt": "text",
  "gemini-1:image": "image",
  "gemini-1:response": "text",
  "gemini-2:prompt": "text",
  "gemini-2:image": "image",
  "gemini-2:response": "text",
  "gemini-final:prompt": "text",
  "gemini-final:image": "image",
  "gemini-final:response": "text",
  "response:result": "text",
};

const INITIAL_NODES: FlowNode[] = [
  {
    id: "request-inputs",
    type: "workflowNode",
    position: { x: 20, y: 220 },
    deletable: false,
    data: {
      title: "Request-Inputs",
      kind: "request",
      fixed: true,
      fields: ["text_field", "image_field"],
      output: "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.",
    },
  },
  {
    id: "crop-1",
    type: "workflowNode",
    position: { x: 360, y: 50 },
    data: {
      title: "Crop Image #1",
      kind: "crop",
      crop: { x: 20, y: 20, width: 60, height: 60 },
    },
  },
  {
    id: "crop-2",
    type: "workflowNode",
    position: { x: 360, y: 365 },
    data: {
      title: "Crop Image #2",
      kind: "crop",
      crop: { x: 0, y: 0, width: 100, height: 50 },
    },
  },
  {
    id: "gemini-1",
    type: "workflowNode",
    position: { x: 360, y: 205 },
    data: {
      title: "Gemini 3.1 Pro #1",
      kind: "gemini",
      systemPrompt: "You are a marketing copywriter. Write a one-paragraph product description.",
      prompt: "Request-Inputs.text_field",
    },
  },
  {
    id: "gemini-2",
    type: "workflowNode",
    position: { x: 710, y: 205 },
    data: {
      title: "Gemini 3.1 Pro #2",
      kind: "gemini",
      systemPrompt: "Condense the following product description into a tweet-length hook under 240 characters.",
      prompt: "Gemini #1.Response",
    },
  },
  {
    id: "gemini-final",
    type: "workflowNode",
    position: { x: 1040, y: 170 },
    data: {
      title: "Final Gemini",
      kind: "gemini",
      systemPrompt: "You are a social media manager. Combine the tweet hook and two product crops into a final marketing post.",
      prompt: "Gemini #2.Response + Crop outputs",
    },
  },
  {
    id: "response",
    type: "workflowNode",
    position: { x: 1390, y: 250 },
    deletable: false,
    data: {
      title: "Response",
      kind: "response",
      fixed: true,
      fields: ["result"],
    },
  },
];

const INITIAL_EDGES: FlowEdge[] = [
  edge("request-inputs", "image_field", "crop-1", "input-image", "image"),
  edge("request-inputs", "image_field", "crop-2", "input-image", "image"),
  edge("request-inputs", "text_field", "gemini-1", "prompt", "text"),
  edge("gemini-1", "response", "gemini-2", "prompt", "text"),
  edge("crop-1", "output-image", "gemini-final", "image", "image"),
  edge("crop-2", "output-image", "gemini-final", "image", "image"),
  edge("gemini-2", "response", "gemini-final", "prompt", "text"),
  edge("gemini-final", "response", "response", "result", "text"),
];

const NODE_PICKER = [
  { kind: "crop" as const, label: "Crop Image", category: "Image" },
  { kind: "gemini" as const, label: "Gemini 3.1 Pro", category: "Recent" },
];

function edge(source: string, sourceHandle: string, target: string, targetHandle: string, kind: PortKind): FlowEdge {
  return {
    id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    animated: true,
    data: { kind },
    style: { stroke: kind === "image" ? "#7c8cff" : "#ff9b38", strokeWidth: 2 },
  };
}

function statusClass(status: RunStatus = "idle") {
  if (status === "running") return "node-running";
  if (status === "success") return "node-success";
  if (status === "queued") return "node-queued";
  if (status === "failed") return "node-failed";
  return "";
}

function Port({ id, type, position, label, kind }: { id: string; type: "source" | "target"; position: Position; label: string; kind: PortKind }) {
  return (
    <div className="relative flex items-center gap-2 rounded bg-[#f5f5f2] px-2 py-1 text-[10px] text-[#6d6b65]">
      <Handle
        id={id}
        type={type}
        position={position}
        className={kind === "image" ? "react-flow__handle-image" : "react-flow__handle-text"}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

function WorkflowNode({ data, selected }: NodeProps<FlowNodeData>) {
  const isCrop = data.kind === "crop";
  const isGemini = data.kind === "gemini";
  const isRequest = data.kind === "request";
  const isResponse = data.kind === "response";
  const crop = data.crop;

  return (
    <div className={`workflow-card ${selected ? "workflow-card-selected" : ""} ${statusClass(data.status)}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-[#232323]">{data.title}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[#918f88]">
            {data.fixed ? "locked" : data.kind}
          </div>
        </div>
        <div className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${data.status === "running" ? "bg-[#ece9ff] text-[#5947ca]" : "bg-[#ecf8ef] text-[#257942]"}`}>
          {data.status === "running" ? "Run" : data.status === "success" ? "Done" : "Idle"}
        </div>
      </div>

      {isRequest ? (
        <div className="space-y-2">
          <div className="rounded border border-[#e6e4df] bg-white p-2 text-[10px] text-[#55524b]">
            <div className="font-medium text-[#333]">text_field</div>
            <div className="mt-1 line-clamp-2">{data.output}</div>
          </div>
          <Port id="text_field" type="source" position={Position.Right} label="text_field" kind="text" />
          <Port id="image_field" type="source" position={Position.Right} label="image_field" kind="image" />
        </div>
      ) : null}

      {isCrop ? (
        <div className="space-y-2">
          <Port id="input-image" type="target" position={Position.Left} label="Input Image" kind="image" />
          <div className="grid grid-cols-4 gap-1 text-[10px]">
            <span className="rounded bg-[#f5f5f2] px-1.5 py-1">X {crop?.x}%</span>
            <span className="rounded bg-[#f5f5f2] px-1.5 py-1">Y {crop?.y}%</span>
            <span className="rounded bg-[#f5f5f2] px-1.5 py-1">W {crop?.width}%</span>
            <span className="rounded bg-[#f5f5f2] px-1.5 py-1">H {crop?.height}%</span>
          </div>
          <div className="rounded border border-[#edeae4] bg-white p-2 text-[10px] text-[#77756f]">Trigger.dev task with mandatory 30+ second wait.</div>
          <Port id="output-image" type="source" position={Position.Right} label="Output Image" kind="image" />
        </div>
      ) : null}

      {isGemini ? (
        <div className="space-y-2">
          <Port id="prompt" type="target" position={Position.Left} label="Prompt" kind="text" />
          <Port id="image" type="target" position={Position.Left} label="Image (Vision)" kind="image" />
          <div className="rounded border border-[#e6e4df] bg-white p-2 text-[10px] text-[#55524b]">
            <div className="font-medium text-[#333]">System Prompt</div>
            <div className="mt-1 line-clamp-2">{data.systemPrompt}</div>
          </div>
          <div className="rounded bg-[#f5f5f2] p-2 text-[10px] text-[#77756f]">Model: Gemini 3.1 Pro</div>
          <Port id="response" type="source" position={Position.Right} label="Response" kind="text" />
        </div>
      ) : null}

      {isResponse ? (
        <div className="space-y-2">
          <Port id="result" type="target" position={Position.Left} label="result" kind="text" />
          <div className="rounded border border-[#e6e4df] bg-white p-2 text-[10px] text-[#77756f]">Final result captured for display/export.</div>
        </div>
      ) : null}

      {data.duration ? <div className="mt-3 text-[10px] text-[#77756f]">Last run: {data.duration}</div> : null}
    </div>
  );
}

const nodeTypes = { workflowNode: WorkflowNode };

function portKey(nodeId?: string | null, handleId?: string | null) {
  return `${nodeId ?? ""}:${handleId ?? ""}`;
}

function isCompatible(connection: Connection) {
  const sourceKind = PORT_TYPES[portKey(connection.source, connection.sourceHandle)];
  const targetKind = PORT_TYPES[portKey(connection.target, connection.targetHandle)];

  if (!sourceKind || !targetKind) return false;
  if (sourceKind === "any" || targetKind === "any") return true;
  return sourceKind === targetKind;
}

function wouldCreateCycle(edges: FlowEdge[], connection: Connection) {
  if (!connection.source || !connection.target) return true;

  const adjacency = new Map<string, string[]>();
  for (const item of edges) {
    const next = adjacency.get(item.source) ?? [];
    next.push(item.target);
    adjacency.set(item.source, next);
  }
  adjacency.set(connection.source, [...(adjacency.get(connection.source) ?? []), connection.target]);

  const seen = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (nodeId === connection.source && seen.size > 0) return true;
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    return (adjacency.get(nodeId) ?? []).some(visit);
  };

  return visit(connection.target);
}

function makeAddedNode(kind: "crop" | "gemini", count: number): FlowNode {
  const id = `${kind}-${Date.now()}-${count}`;
  return {
    id,
    type: "workflowNode",
    position: { x: 560 + count * 32, y: 140 + count * 28 },
    data:
      kind === "crop"
        ? {
            title: `Crop Image #${count}`,
            kind: "crop",
            crop: { x: 0, y: 0, width: 100, height: 100 },
          }
        : {
            title: `Gemini 3.1 Pro #${count}`,
            kind: "gemini",
            systemPrompt: "Describe the connected inputs clearly.",
            prompt: "",
          },
  };
}

function cloneSnapshot(nodes: FlowNode[], edges: FlowEdge[]): Snapshot {
  return {
    nodes: nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, crop: node.data.crop ? { ...node.data.crop } : undefined } })),
    edges: edges.map((item) => ({ ...item, data: item.data ? { ...item.data } : undefined })),
  };
}

function normalizeFlowNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => ({
    ...node,
    id: String(node.id).trim(),
    type: "workflowNode",
    position: node.position ? { x: node.position.x, y: node.position.y } : { x: 0, y: 0 },
    data: { ...node.data },
  }));
}

const HANDLE_NORMALIZATION: Record<string, string> = {
  inputImage: "input-image",
  outputImage: "output-image",
  imageField: "image_field",
  textField: "text_field",
  inputimage: "input-image",
  outputimage: "output-image",
  imagefield: "image_field",
  textfield: "text_field",
};

function normalizeHandleId(handleId?: string | null): string | null {
  if (!handleId) return null;
  const trimmed = handleId.trim();
  return HANDLE_NORMALIZATION[trimmed] ?? trimmed;
}

function normalizeFlowEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map((edge) => {
    return {
      ...edge,
      id: String(edge.id ?? "").trim(),
      source: String(edge.source ?? "").trim(),
      target: String(edge.target ?? "").trim(),
      sourceHandle: normalizeHandleId(edge.sourceHandle ? String(edge.sourceHandle) : null),
      targetHandle: normalizeHandleId(edge.targetHandle ? String(edge.targetHandle) : null),
      data: edge.data ? { ...edge.data } : undefined,
    };
  });
}

export default function WorkflowCanvas({
  workflowId,
  workflowName,
  initialFlow,
  initialHistoryRuns,
}: {
  workflowId: string;
  workflowName: string;
  initialFlow?: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
  initialHistoryRuns?: HistoryRun[];
}) {
  const initialSnapshot = useMemo<Snapshot>(() => {
    if (initialFlow && Array.isArray(initialFlow.nodes) && Array.isArray(initialFlow.edges)) {
      return {
        nodes: normalizeFlowNodes(initialFlow.nodes),
        edges: normalizeFlowEdges(initialFlow.edges),
      };
    }

    return {
      nodes: INITIAL_NODES,
      edges: INITIAL_EDGES,
    };
  }, [initialFlow]);

  const [nodes, setNodes] = useState<FlowNode[]>(initialSnapshot.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialSnapshot.edges);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<HistoryRun[]>(initialHistoryRuns ?? []);
  const [toast, setToast] = useState("Ready");
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [runCounter, setRunCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loggedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [saving, setSaving] = useState(false);

  const saveWorkflow = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/workflow/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      setToast("Workflow saved.");
    } catch {
      setToast("Unable to save workflow. Check your network.");
    } finally {
      setSaving(false);
    }
  }, [edges, nodes, workflowId]);

  const persistRun = useCallback(
    async (run: PersistedRun) => {
      try {
        await fetch(`/api/workflow/${workflowId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(run),
        });
      } catch {
        // Silently ignore persistence failures while keeping local UI state.
      }
    },
    [workflowId],
  );

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    console.log("[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>");
  }, []);

  useEffect(() => {
    return () => {
      timerRef.current.forEach(clearTimeout);
    };
  }, []);

  const selectedNodeIds = useMemo(() => nodes.filter((node) => node.selected).map((node) => node.id), [nodes]);

  const pushUndo = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-19), cloneSnapshot(nodes, edges)]);
    setRedoStack([]);
  }, [edges, nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as FlowNode[]);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current) as FlowEdge[]);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const normalizedConnection = {
        ...connection,
        sourceHandle: normalizeHandleId(connection.sourceHandle ? String(connection.sourceHandle) : undefined),
        targetHandle: normalizeHandleId(connection.targetHandle ? String(connection.targetHandle) : undefined),
      };

      if (!isCompatible(normalizedConnection)) {
        setToast("Invalid drag rejected: handle types do not match.");
        return;
      }

      if (wouldCreateCycle(edges, normalizedConnection)) {
        setToast("Invalid drag rejected: workflow must remain a DAG.");
        return;
      }

      pushUndo();
      const kind = PORT_TYPES[portKey(normalizedConnection.source, normalizedConnection.sourceHandle)];
      setEdges((current) =>
        addEdge(
          {
            ...normalizedConnection,
            animated: true,
            data: { kind },
            style: { stroke: kind === "image" ? "#7c8cff" : "#ff9b38", strokeWidth: 2 },
          },
          current,
        ) as FlowEdge[],
      );
      setToast("Connection added.");
    },
    [edges, pushUndo],
  );

  const addNode = useCallback(
    (kind: "crop" | "gemini") => {
      pushUndo();
      const count = nodes.filter((node) => node.data.kind === kind).length + 1;
      setNodes((current) => [...current, makeAddedNode(kind, count)]);
      setPickerOpen(false);
      setToast(`${kind === "crop" ? "Crop Image" : "Gemini 3.1 Pro"} node added.`);
    },
    [nodes, pushUndo],
  );

  const deleteSelected = useCallback(() => {
    const removable = new Set(selectedNodeIds.filter((id) => !REQUIRED_NODE_IDS.has(id)));
    if (removable.size === 0) {
      setToast("Request-Inputs and Response cannot be deleted.");
      return;
    }
    pushUndo();
    setNodes((current) => current.filter((node) => !removable.has(node.id)));
    setEdges((current) => current.filter((item) => !removable.has(item.source) && !removable.has(item.target)));
    setToast("Selected node deleted.");
  }, [pushUndo, selectedNodeIds]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setRedoStack((redo) => [...redo, cloneSnapshot(nodes, edges)]);
      setNodes(previous.nodes);
      setEdges(previous.edges);
      setToast("Undo applied.");
      return stack.slice(0, -1);
    });
  }, [edges, nodes]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const next = stack.at(-1);
      if (!next) return stack;
      setUndoStack((undoItems) => [...undoItems, cloneSnapshot(nodes, edges)]);
      setNodes(next.nodes);
      setEdges(next.edges);
      setToast("Redo applied.");
      return stack.slice(0, -1);
    });
  }, [edges, nodes]);

  const updateStatus = useCallback((ids: string[], status: RunStatus, duration?: string) => {
    setNodes((current) =>
      current.map((node) =>
        ids.includes(node.id)
          ? {
              ...node,
              data: {
                ...node.data,
                status,
                duration: duration ?? node.data.duration,
              },
            }
          : node,
      ),
    );
  }, []);

  const runWorkflow = useCallback(
    (scope: "full" | "selected" | "single") => {
      timerRef.current.forEach(clearTimeout);
      timerRef.current = [];

      const targetIds = scope === "full" ? nodes.map((node) => node.id) : selectedNodeIds.length ? selectedNodeIds : ["gemini-1"];
      const localIds = targetIds.filter((id): id is "request-inputs" | "response" => id === "request-inputs" || id === "response");
      const executableIds = targetIds.filter((id) => id !== "request-inputs" && id !== "response");

      const incomingDependencies = new Map<string, string[]>();
      for (const edge of edges) {
        if (!targetIds.includes(edge.target)) continue;
        if (
          !targetIds.includes(edge.source) &&
          edge.source !== "request-inputs" &&
          edge.source !== "response"
        ) {
          continue;
        }

        incomingDependencies.set(edge.target, [...(incomingDependencies.get(edge.target) ?? []), edge.source]);
      }

      const isReady = (nodeId: string, completed: Set<string>) => {
        const deps = incomingDependencies.get(nodeId) ?? [];
        if (deps.length === 0) return true;
        return deps.every((sourceId) => {
          if (sourceId === "request-inputs" || sourceId === "response") return true;
          return completed.has(sourceId);
        });
      };

      const runDurationMs = (nodeId: string) => {
        const nodeKind = nodes.find((node) => node.id === nodeId)?.data.kind;
        if (nodeKind === "crop") return 31800;
        if (nodeKind === "gemini") return 4200;
        return 100;
      };

      const runDurationLabel = (nodeId: string) => {
        const nodeKind = nodes.find((node) => node.id === nodeId)?.data.kind;
        if (nodeKind === "crop") return "31.8s";
        if (nodeKind === "gemini") return "4.2s";
        return "0.1s";
      };

      const completed = new Set<string>();
      const running = new Set<string>();
      const scheduleNext = () => {
        const readyNodes = executableIds.filter(
          (id) => !completed.has(id) && !running.has(id) && isReady(id, completed),
        );

        if (readyNodes.length === 0) {
          if (running.size === 0) {
            if (targetIds.includes("response")) {
              updateStatus(["response"], "success", "0.1s");
            }
            const nextRunNumber = runCounter + 1;
            const runId = String(nextRunNumber);
            setRunCounter(nextRunNumber);
            const runScope: PersistedRun["scope"] =
              scope === "full" ? "full" : scope === "selected" ? "partial" : "single";
            const uiRun: HistoryRun = {
              id: runId,
              scope: scope === "full" ? "Full Workflow" : scope === "selected" ? "Multi-select" : "Single Node",
              status: "success",
              startedAt: new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date()),
              duration: executableIds.some((id) => nodes.find((item) => item.id === id)?.data.kind === "crop") ? "31.8s" : "4.5s",
              nodes: targetIds.map((id) => {
                const node = nodes.find((item) => item.id === id);
                return {
                  id,
                  title: node?.data.title ?? id,
                  status: "success",
                  duration: node?.data.kind === "crop" ? "31.8s" : node?.data.kind === "gemini" ? "4.2s" : "0.1s",
                  output: node?.data.kind === "crop" ? "https://cdn.transloadit.com/..." : node?.data.kind === "gemini" ? "Generated response preview..." : "Values resolved locally",
                };
              }),
            };

            const persistedRun = {
              scope: runScope,
              status: uiRun.status,
              nodes: uiRun.nodes,
            };

            setHistoryRuns((current) => [uiRun, ...current]);
            setExpandedRun(runId);
            setToast("Run complete. History entry created.");
            void persistRun(persistedRun);
          }
          return;
        }

        updateStatus(readyNodes, "running");
        readyNodes.forEach((nodeId) => {
          running.add(nodeId);
          const durationMs = runDurationMs(nodeId);
          timerRef.current.push(
            setTimeout(() => {
              running.delete(nodeId);
              completed.add(nodeId);
              updateStatus([nodeId], "success", runDurationLabel(nodeId));
              scheduleNext();
            }, durationMs),
          );
        });
      };

      updateStatus(targetIds, "queued");
      setToast("Run started. Independent siblings execute concurrently.");
      timerRef.current.push(
        setTimeout(() => {
          updateStatus(localIds, "success", "0.1s");
          scheduleNext();
        }, 250),
      );
    },
    [edges, nodes, runCounter, selectedNodeIds, updateStatus],
  );

  const exportJson = useCallback(() => {
    const payload = JSON.stringify({ nodes, edges }, null, 2);
    void navigator.clipboard?.writeText(payload);
    setToast("Workflow JSON copied to clipboard.");
  }, [edges, nodes]);

  const importJson = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Snapshot;
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error("Invalid workflow file");
        }
        pushUndo();
        setNodes(normalizeFlowNodes(parsed.nodes));
        setEdges(normalizeFlowEdges(parsed.edges));
        setToast("Workflow JSON imported.");
      } catch {
        setToast("Import failed: JSON did not match workflow format.");
      }
    };
    reader.readAsText(file);
  }, [pushUndo]);

  return (
    <main className="h-screen overflow-hidden bg-[#f7f7f5] text-[#1f1f1f]">
      <div className="grid h-full grid-cols-[260px_1fr_330px]">
        <aside className="border-r border-[#e0ded8] bg-white p-4">
          <div className="mb-5 flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-[#191919] text-sm font-semibold text-white">N</div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{workflowName}</h1>
              <p className="text-xs text-[#77756f]">Workflow canvas</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <button className="w-full rounded-md bg-[#191919] px-3 py-2 text-left text-sm font-medium text-white" onClick={() => runWorkflow("full")}>
              Run workflow
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5]" onClick={() => runWorkflow("single")}>
                Run node
              </button>
              <button className="rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5]" onClick={() => runWorkflow("selected")}>
                Run selected
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-50" disabled={undoStack.length === 0} onClick={undo}>
                Undo
              </button>
              <button className="rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-50" disabled={redoStack.length === 0} onClick={redo}>
                Redo
              </button>
            </div>
            <button className="w-full rounded-md border border-[#191919] bg-[#191919] px-2 py-2 text-xs font-medium text-white hover:bg-[#343434] disabled:cursor-not-allowed disabled:opacity-50" disabled={saving} onClick={saveWorkflow}>
              {saving ? "Saving..." : "Save workflow"}
            </button>
            <button className="w-full rounded-md border border-[#f0c5c5] px-2 py-2 text-xs font-medium text-[#a83232] hover:bg-[#fff6f6]" onClick={deleteSelected}>
              Delete selected
            </button>
          </div>

          <div className="mt-6 border-t border-[#edebe5] pt-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#77756f]">Workflow JSON</h2>
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5]" onClick={exportJson}>
                Export
              </button>
              <button className="rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5]" onClick={() => fileInputRef.current?.click()}>
                Import
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importJson(file);
              }}
            />
          </div>

          <div className="mt-6 rounded-md border border-[#e6e4df] bg-[#fbfbf9] p-3 text-xs text-[#6d6b65]">
            <div className="font-medium text-[#333]">Status</div>
            <p className="mt-1">{toast}</p>
          </div>
        </aside>

        <section className="relative min-w-0">
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md border border-[#e2e0da] bg-white/95 px-3 py-2 shadow-sm">
            <a className="text-xs font-medium text-[#55524b] hover:text-[#191919]" href="/dashboard">
              Dashboard
            </a>
            <span className="text-[#c4c1b9]">/</span>
            <span className="text-xs text-[#77756f]">Trial Task Workflow</span>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable
          >
            <Background color="#dedbd4" gap={18} size={1.3} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => (node.data?.kind === "crop" ? "#7c8cff" : node.data?.kind === "gemini" ? "#ffb15f" : "#191919")}
            />
          </ReactFlow>

          <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
            <div className="relative flex items-center gap-2 rounded-md border border-[#dedbd4] bg-white px-2 py-2 shadow-lg">
              <button className="grid size-8 place-items-center rounded-md bg-[#191919] text-lg font-semibold leading-none text-white" onClick={() => setPickerOpen((value) => !value)}>
                +
              </button>
              <button className="rounded-md border border-[#e1dfd9] px-3 py-2 text-xs font-medium" onClick={() => setToast("Fit view is available in the bottom-left React Flow controls.")}>
                Fit
              </button>
              {pickerOpen ? (
                <div className="absolute bottom-14 left-1/2 w-72 -translate-x-1/2 rounded-md border border-[#dedbd4] bg-white p-2 shadow-xl">
                  <input className="mb-2 w-full rounded-md border border-[#d9d8d2] px-3 py-2 text-sm outline-none" placeholder="Search nodes" />
                  {NODE_PICKER.map((item) => (
                    <button key={item.label} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[#f7f7f5]" onClick={() => addNode(item.kind)}>
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-[#77756f]">{item.category}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="border-l border-[#e0ded8] bg-white p-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Workflow History</h2>
            <p className="text-xs text-[#77756f]">Runs include scope, duration, status, and node-level details.</p>
          </div>

          <div className="space-y-3 overflow-y-auto pr-1">
            {historyRuns.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#d9d8d2] bg-[#fbfbf9] p-4 text-sm text-[#77756f]">
                Run the workflow to create the first history entry.
              </div>
            ) : null}
            {historyRuns.map((run) => (
              <div key={run.id} className="rounded-md border border-[#e6e4df] bg-[#fbfbf9]">
                <button className="w-full px-3 py-3 text-left" onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Run #{run.id}</span>
                    <span className="rounded-full bg-[#ecf8ef] px-2 py-1 text-[10px] font-medium text-[#257942]">{run.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#77756f]">{run.startedAt} - {run.scope} - {run.duration}</div>
                </button>
                {expandedRun === run.id ? (
                  <div className="border-t border-[#e6e4df] px-3 py-3">
                    {run.nodes.map((node) => (
                      <div key={`${run.id}-${node.id}`} className="grid grid-cols-[14px_1fr] gap-2 py-1.5 text-xs">
                        <span className="mt-0.5 grid size-3 place-items-center rounded-sm bg-[#5dcb85] text-[9px] text-white">OK</span>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{node.title}</span>
                            <span className="text-[#77756f]">{node.duration}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[#77756f]">&gt; {node.output}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

