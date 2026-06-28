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
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "reactflow";

import "reactflow/dist/style.css";

import NodeConfigPanel from "@/components/workflow/NodeConfigPanel";
import { WorkflowEditorContext } from "@/components/workflow/context";
import WorkflowNode from "@/components/workflow/WorkflowNode";
import {
  type FlowEdge,
  type FlowNode,
  type HistoryRun,
  type NodeKind,
  type PersistedRun,
  type PortKind,
  type RunStatus,
  type Snapshot,
  sanitizeNodesForPersistence,
} from "@/components/workflow/types";

const REQUIRED_NODE_IDS = new Set(["request-inputs", "response"]);

const EMPTY_SNAPSHOT: Snapshot = { nodes: [], edges: [] };

const SAMPLE_NODES: FlowNode[] = [
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

const SAMPLE_EDGES: FlowEdge[] = [
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
  { kind: "request" as const, label: "Request-Inputs", category: "Core" },
  { kind: "crop" as const, label: "Crop Image", category: "Image" },
  { kind: "gemini" as const, label: "Gemini 3.1 Pro", category: "Recent" },
  { kind: "response" as const, label: "Response", category: "Core" },
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

const nodeTypes = { workflowNode: WorkflowNode };

function buildRunOutput(node: FlowNode): string {
  switch (node.data.kind) {
    case "crop":
      return JSON.stringify(
        { url: "https://cdn.transloadit.com/cropped-output.jpg", crop: node.data.crop },
        null,
        2,
      );
    case "gemini":
      return JSON.stringify(
        {
          model: "gemini-3.1-pro",
          response: "Generated response preview based on connected inputs.",
          prompt: node.data.prompt ?? "",
        },
        null,
        2,
      );
    case "request":
      return JSON.stringify({ text_field: node.data.output ?? "", image_field: "[binary]" }, null, 2);
    case "response":
      return JSON.stringify({ result: "Workflow result captured for display/export." }, null, 2);
    default:
      return "{}";
  }
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

function getPortKind(node: FlowNode | undefined, handleId?: string | null): PortKind | undefined {
  if (!node || !handleId) return undefined;

  const handle = normalizeHandleId(handleId) ?? handleId;

  if (node.data.kind === "request") {
    if (handle === "text_field") return "text";
    if (handle === "image_field") return "image";
  }

  if (node.data.kind === "crop") {
    if (handle === "input-image" || handle === "output-image") return "image";
  }

  if (node.data.kind === "gemini") {
    if (handle === "prompt" || handle === "response") return "text";
    if (handle === "image") return "image";
  }

  if (node.data.kind === "response") {
    if (handle === "result") return "text";
  }

  return undefined;
}

function isCompatible(connection: Connection, flowNodes: FlowNode[]) {
  const sourceNode = flowNodes.find((node) => node.id === connection.source);
  const targetNode = flowNodes.find((node) => node.id === connection.target);
  const sourceKind = getPortKind(sourceNode, connection.sourceHandle);
  const targetKind = getPortKind(targetNode, connection.targetHandle);

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

function makeAddedNode(kind: NodeKind, count: number): FlowNode {
  if (kind === "request") {
    return {
      id: "request-inputs",
      type: "workflowNode",
      position: { x: 80, y: 220 },
      deletable: false,
      data: {
        title: "Request-Inputs",
        kind: "request",
        fixed: true,
        fields: ["text_field", "image_field"],
        output: "",
      },
    };
  }

  if (kind === "response") {
    return {
      id: "response",
      type: "workflowNode",
      position: { x: 720, y: 220 },
      deletable: false,
      data: {
        title: "Response",
        kind: "response",
        fixed: true,
        fields: ["result"],
      },
    };
  }

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
  return nodes.map((node) => {
    const configData = { ...node.data };
    delete configData.status;
    delete configData.duration;
    delete configData.runOutput;
    delete configData.runError;

    return {
      ...node,
      id: String(node.id).trim(),
      type: "workflowNode",
      position: node.position ? { x: node.position.x, y: node.position.y } : { x: 0, y: 0 },
      data: configData,
    };
  });
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

    return EMPTY_SNAPSHOT;
  }, [initialFlow]);

  const [nodes, setNodes] = useState<FlowNode[]>(initialSnapshot.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialSnapshot.edges);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<HistoryRun[]>(initialHistoryRuns ?? []);
  const [toast, setToast] = useState("Ready");
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loggedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveRequest, setSaveRequest] = useState(0);
  const latestFlowRef = useRef({ nodes: initialSnapshot.nodes, edges: initialSnapshot.edges });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestFlowRef.current = { nodes, edges };
  }, [edges, nodes]);

  const markCanvasChanged = useCallback(() => {
    setSaveStatus("saving");
    setSaveRequest((value) => value + 1);
  }, []);

  const saveWorkflow = useCallback(
    async (showToast = true) => {
      setSaveStatus("saving");
      try {
        const { nodes: latestNodes, edges: latestEdges } = latestFlowRef.current;
        const response = await fetch(`/api/workflow/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: sanitizeNodesForPersistence(latestNodes),
            edges: latestEdges,
          }),
        });

        if (!response.ok) {
          throw new Error("Save failed");
        }

        setSaveStatus("saved");
        if (showToast) setToast("Workflow saved.");
        return true;
      } catch {
        setSaveStatus("error");
        if (showToast) setToast("Unable to save workflow. Check your network.");
        return false;
      }
    },
    [workflowId],
  );

  const fetchHistoryRuns = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflow/${workflowId}`, { method: "GET" });
      if (!response.ok) return;
      const payload = (await response.json()) as { runs?: HistoryRun[] };
      if (Array.isArray(payload.runs)) {
        setHistoryRuns(payload.runs);
      }
    } catch {
      // Keep the last known persisted history if a poll fails.
    }
  }, [workflowId]);

  const persistRun = useCallback(
    async (run: PersistedRun) => {
      try {
        const response = await fetch(`/api/workflow/${workflowId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(run),
        });

        if (!response.ok) {
          throw new Error("Run persistence failed");
        }

        const payload = (await response.json()) as { runId?: string; runs?: HistoryRun[] };
        if (Array.isArray(payload.runs)) {
          setHistoryRuns(payload.runs);
        }
        return payload.runId;
      } catch {
        setToast("Run complete, but history persistence failed.");
        return undefined;
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
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (saveRequest === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveWorkflow(false);
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [saveRequest, saveWorkflow]);

  useEffect(() => {
    const initialFetch = setTimeout(() => {
      void fetchHistoryRuns();
    }, 0);
    const interval = setInterval(() => {
      void fetchHistoryRuns();
    }, 5000);

    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchHistoryRuns]);

  const selectedNodeIds = useMemo(() => nodes.filter((node) => node.selected).map((node) => node.id), [nodes]);
  const selectedNode = useMemo(
    () => (selectedNodeIds.length === 1 ? nodes.find((node) => node.id === selectedNodeIds[0]) ?? null : null),
    [nodes, selectedNodeIds],
  );

  const updateNodeData = useCallback((nodeId: string, patch: Partial<FlowNode["data"]>) => {
    markCanvasChanged();
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node,
      ),
    );
  }, [markCanvasChanged]);

  const editorContextValue = useMemo(() => ({ updateNodeData }), [updateNodeData]);

  const pushUndo = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-19), cloneSnapshot(nodes, edges)]);
    setRedoStack([]);
  }, [edges, nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (changes.some((change) => change.type === "add" || change.type === "remove" || change.type === "position")) {
      markCanvasChanged();
    }
    setNodes((current) => applyNodeChanges(changes, current) as FlowNode[]);
  }, [markCanvasChanged]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (changes.some((change) => change.type === "add" || change.type === "remove")) {
      markCanvasChanged();
    }
    setEdges((current) => applyEdgeChanges(changes, current) as FlowEdge[]);
  }, [markCanvasChanged]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const normalizedConnection = {
        ...connection,
        sourceHandle: normalizeHandleId(connection.sourceHandle ? String(connection.sourceHandle) : undefined),
        targetHandle: normalizeHandleId(connection.targetHandle ? String(connection.targetHandle) : undefined),
      };

      if (!isCompatible(normalizedConnection, nodes)) {
        setToast("Invalid drag rejected: handle types do not match.");
        return;
      }

      if (wouldCreateCycle(edges, normalizedConnection)) {
        setToast("Invalid drag rejected: workflow must remain a DAG.");
        return;
      }

      pushUndo();
      markCanvasChanged();
      const sourceNode = nodes.find((node) => node.id === normalizedConnection.source);
      const kind = getPortKind(sourceNode, normalizedConnection.sourceHandle) ?? "text";
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
    [edges, markCanvasChanged, nodes, pushUndo],
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      if (kind === "request" && nodes.some((node) => node.id === "request-inputs")) {
        setToast("Request-Inputs is already on the canvas.");
        setPickerOpen(false);
        return;
      }

      if (kind === "response" && nodes.some((node) => node.id === "response")) {
        setToast("Response is already on the canvas.");
        setPickerOpen(false);
        return;
      }

      pushUndo();
      markCanvasChanged();
      const count = nodes.filter((node) => node.data.kind === kind).length + 1;
      setNodes((current) => [...current, makeAddedNode(kind, count)]);
      setPickerOpen(false);
      const labels: Record<NodeKind, string> = {
        request: "Request-Inputs",
        crop: "Crop Image",
        gemini: "Gemini 3.1 Pro",
        response: "Response",
      };
      setToast(`${labels[kind]} node added.`);
    },
    [markCanvasChanged, nodes, pushUndo],
  );

  const loadSampleWorkflow = useCallback(() => {
    pushUndo();
    markCanvasChanged();
    setNodes(normalizeFlowNodes(SAMPLE_NODES));
    setEdges(normalizeFlowEdges(SAMPLE_EDGES));
    setToast("Sample workflow loaded.");
  }, [markCanvasChanged, pushUndo]);

  const deleteSelected = useCallback(() => {
    const removable = new Set(selectedNodeIds.filter((id) => !REQUIRED_NODE_IDS.has(id)));
    if (removable.size === 0) {
      setToast("Request-Inputs and Response cannot be deleted.");
      return;
    }
    pushUndo();
    markCanvasChanged();
    setNodes((current) => current.filter((node) => !removable.has(node.id)));
    setEdges((current) => current.filter((item) => !removable.has(item.source) && !removable.has(item.target)));
    setToast("Selected node deleted.");
  }, [markCanvasChanged, pushUndo, selectedNodeIds]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setRedoStack((redo) => [...redo, cloneSnapshot(nodes, edges)]);
      markCanvasChanged();
      setNodes(previous.nodes);
      setEdges(previous.edges);
      setToast("Undo applied.");
      return stack.slice(0, -1);
    });
  }, [edges, markCanvasChanged, nodes]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const next = stack.at(-1);
      if (!next) return stack;
      setUndoStack((undoItems) => [...undoItems, cloneSnapshot(nodes, edges)]);
      markCanvasChanged();
      setNodes(next.nodes);
      setEdges(next.edges);
      setToast("Redo applied.");
      return stack.slice(0, -1);
    });
  }, [edges, markCanvasChanged, nodes]);

  const updateNodeRunState = useCallback(
    (
      ids: string[],
      status: RunStatus,
      options?: {
        duration?: string;
        runOutput?: string;
        runError?: string;
      },
    ) => {
      setNodes((current) =>
        current.map((node) =>
          ids.includes(node.id)
            ? {
                ...node,
                data: {
                  ...node.data,
                  status,
                  duration: options?.duration ?? node.data.duration,
                  runOutput: options?.runOutput ?? (status === "idle" ? undefined : node.data.runOutput),
                  runError: options?.runError ?? (status === "idle" ? undefined : node.data.runError),
                },
              }
            : node,
        ),
      );
    },
    [],
  );

  const resetRunState = useCallback((targetIds: string[]) => {
    setNodes((current) =>
      current.map((node) =>
        targetIds.includes(node.id)
          ? {
              ...node,
              data: {
                ...node.data,
                status: "idle" as RunStatus,
                duration: undefined,
                runOutput: undefined,
                runError: undefined,
              },
            }
          : node,
      ),
    );
  }, []);

  const runWorkflow = useCallback(
    (scope: "full" | "selected" | "single") => {
      if (nodes.length === 0) {
        setToast("Add nodes before running the workflow.");
        return;
      }

      timerRef.current.forEach(clearTimeout);
      timerRef.current = [];

      const executableNodes = nodes.filter((node) => node.id !== "request-inputs" && node.id !== "response");
      const fallbackSingleId = selectedNodeIds[0] ?? executableNodes[0]?.id;
      const targetIds =
        scope === "full"
          ? nodes.map((node) => node.id)
          : selectedNodeIds.length
            ? selectedNodeIds
            : fallbackSingleId
              ? [fallbackSingleId]
              : [];

      if (targetIds.length === 0) {
        setToast("Select a node to run.");
        return;
      }

      const runStartedAt = new Date();
      resetRunState(targetIds);
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
              const responseNode = nodes.find((node) => node.id === "response");
              updateNodeRunState(["response"], "success", {
                duration: "0.1s",
                runOutput: responseNode ? buildRunOutput(responseNode) : undefined,
              });
            }
            const runCompletedAt = new Date();
            const runScope: PersistedRun["scope"] =
              scope === "full" ? "full" : scope === "selected" ? "partial" : "single";
            const persistedRun: PersistedRun = {
              scope: runScope,
              status: "success",
              startedAt: runStartedAt.toISOString(),
              completedAt: runCompletedAt.toISOString(),
              nodes: targetIds.map((id) => {
                const node = nodes.find((item) => item.id === id);
                const duration =
                  node?.data.kind === "crop" ? "31.8s" : node?.data.kind === "gemini" ? "4.2s" : "0.1s";
                return {
                  id,
                  title: node?.data.title ?? id,
                  status: "success" as const,
                  duration,
                  output: node ? buildRunOutput(node) : "",
                };
              }),
            };

            setToast("Run complete. Saving history...");
            void persistRun(persistedRun).then((runId) => {
              if (runId) {
                setExpandedRun(runId);
                setToast("Run complete. History entry saved.");
              }
            });
          }
          return;
        }

        updateNodeRunState(readyNodes, "running");
        readyNodes.forEach((nodeId) => {
          running.add(nodeId);
          const durationMs = runDurationMs(nodeId);
          timerRef.current.push(
            setTimeout(() => {
              running.delete(nodeId);
              completed.add(nodeId);
              const node = nodes.find((item) => item.id === nodeId);
              updateNodeRunState([nodeId], "success", {
                duration: runDurationLabel(nodeId),
                runOutput: node ? buildRunOutput(node) : undefined,
              });
              scheduleNext();
            }, durationMs),
          );
        });
      };

      setToast("Run started. Independent siblings execute concurrently.");
      timerRef.current.push(
        setTimeout(() => {
          targetIds
            .filter((id) => id === "request-inputs" || id === "response")
            .forEach((id) => {
              const node = nodes.find((item) => item.id === id);
              updateNodeRunState([id], "success", {
                duration: "0.1s",
                runOutput: node ? buildRunOutput(node) : undefined,
              });
            });
          scheduleNext();
        }, 250),
      );
    },
    [edges, nodes, persistRun, resetRunState, selectedNodeIds, updateNodeRunState],
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
        markCanvasChanged();
        setNodes(normalizeFlowNodes(parsed.nodes));
        setEdges(normalizeFlowEdges(parsed.edges));
        setToast("Workflow JSON imported.");
      } catch {
        setToast("Import failed: JSON did not match workflow format.");
      }
    };
    reader.readAsText(file);
  }, [markCanvasChanged, pushUndo]);

  const saveStatusText =
    saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved \u2713" : saveStatus === "error" ? "Save failed" : "";

  return (
    <WorkflowEditorContext.Provider value={editorContextValue}>
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
            <button className="w-full rounded-md border border-[#191919] bg-[#191919] px-2 py-2 text-xs font-medium text-white hover:bg-[#343434] disabled:cursor-not-allowed disabled:opacity-50" disabled={saveStatus === "saving"} onClick={() => void saveWorkflow()}>
              {saveStatus === "saving" ? "Saving..." : "Save workflow"}
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
            <button
              className="mt-2 w-full rounded-md border border-[#d9d8d2] px-2 py-2 text-xs font-medium hover:bg-[#f7f7f5]"
              onClick={loadSampleWorkflow}
            >
              Load Sample
            </button>
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
            {saveStatusText ? (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${saveStatus === "error" ? "bg-[#fff1f1] text-[#a83232]" : "bg-[#f3f2ee] text-[#55524b]"}`}>
                {saveStatusText}
              </span>
            ) : null}
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView={nodes.length > 0}
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

          {nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
              <div className="rounded-lg border border-dashed border-[#d9d8d2] bg-white/90 px-8 py-6 text-center shadow-sm">
                <p className="text-sm font-medium text-[#333]">Your workflow is empty</p>
                <p className="mt-2 text-sm text-[#77756f]">Click + below to add nodes and get started</p>
              </div>
            </div>
          ) : null}

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

        <aside className="flex flex-col border-l border-[#e0ded8] bg-white p-4">
          <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} />

          <div className="mb-4">
            <h2 className="text-sm font-semibold">Workflow History</h2>
            <p className="text-xs text-[#77756f]">Runs include scope, duration, status, and node-level details.</p>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
    </WorkflowEditorContext.Provider>
  );
}
