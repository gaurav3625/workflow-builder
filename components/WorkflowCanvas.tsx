"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  ConnectionLineType,
  type EdgeChange,
  MarkerType,
  type NodeChange,
  type ReactFlowInstance,
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
  type PersistedNodeRun,
  type PersistedRun,
  type PortKind,
  type RunStatus,
  type Snapshot,
  sanitizeNodesForPersistence,
} from "@/components/workflow/types";

const REQUIRED_NODE_IDS = new Set(["request-inputs", "response"]);

const STARTER_NODES: FlowNode[] = [
  {
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
  },
  {
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
  },
];

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

const NODE_PALETTE = [
  { kind: "request" as const, label: "Request Inputs", category: "Triggers", icon: "IN", hint: "Receives text and image fields" },
  { kind: "gemini" as const, label: "Gemini 3.1 Pro", category: "Actions", icon: "AI", hint: "Generates text from prompts" },
  { kind: "crop" as const, label: "Crop Image", category: "Actions", icon: "CR", hint: "Transforms image regions" },
  { kind: "gemini" as const, label: "Prompt Branch", category: "Logic", icon: "IF", hint: "Branch text through a model step" },
  { kind: "response" as const, label: "Response", category: "Output", icon: "OUT", hint: "Returns final workflow data" },
];

const PALETTE_CATEGORIES = ["Triggers", "Actions", "Logic", "Output"] as const;

const NODE_KIND_META: Record<NodeKind, { label: string; accent: string }> = {
  request: { label: "HTTP", accent: "#2563eb" },
  crop: { label: "Transform", accent: "#7c3aed" },
  gemini: { label: "AI", accent: "#7c3aed" },
  response: { label: "Output", accent: "#0f9f6e" },
};

function edge(source: string, sourceHandle: string, target: string, targetHandle: string, kind: PortKind): FlowEdge {
  return {
    id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
    type: "smoothstep",
    source,
    sourceHandle,
    target,
    targetHandle,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { kind },
    style: { stroke: kind === "image" ? "#7f8bd8" : "#aeb6c4", strokeWidth: 1.75 },
  };
}

const nodeTypes = { workflowNode: WorkflowNode };

function PanelChevron({ pointing }: { pointing: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {pointing === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

function buildRunOutput(node: FlowNode, flowNodes: FlowNode[] = [], flowEdges: FlowEdge[] = []): string {
  return buildNodeResult(node, flowNodes, flowEdges);
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
  cropX: "crop-x",
  cropY: "crop-y",
  cropWidth: "crop-width",
  cropHeight: "crop-height",
  cropx: "crop-x",
  cropy: "crop-y",
  cropwidth: "crop-width",
  cropheight: "crop-height",
};

const CROP_PARAM_FIELDS = ["x", "y", "width", "height"] as const;
type CropParamField = (typeof CROP_PARAM_FIELDS)[number];
const CROP_PARAM_HANDLES: Record<CropParamField, string> = {
  x: "crop-x",
  y: "crop-y",
  width: "crop-width",
  height: "crop-height",
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
    if (handle === "crop-x" || handle === "crop-y" || handle === "crop-width" || handle === "crop-height") return "number";
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

function hasDuplicateEdge(edges: FlowEdge[], connection: Connection) {
  if (!connection.source || !connection.target) return false;
  const sourceHandle = normalizeHandleId(connection.sourceHandle ? String(connection.sourceHandle) : null);
  const targetHandle = normalizeHandleId(connection.targetHandle ? String(connection.targetHandle) : null);
  return edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      normalizeHandleId(edge.sourceHandle ? String(edge.sourceHandle) : null) === sourceHandle &&
      normalizeHandleId(edge.targetHandle ? String(edge.targetHandle) : null) === targetHandle,
  );
}

function validateConnection(connection: Connection, flowNodes: FlowNode[], flowEdges: FlowEdge[]): { valid: boolean; reason?: string } {
  if (!connection.source || !connection.target) {
    return { valid: false, reason: "Connection is incomplete." };
  }

  if (connection.source === connection.target) {
    return { valid: false, reason: "Cannot connect a node to itself." };
  }

  if (hasDuplicateEdge(flowEdges, connection)) {
    return { valid: false, reason: "These nodes are already connected." };
  }

  if (!isCompatible(connection, flowNodes)) {
    return { valid: false, reason: "Handle types do not match." };
  }

  if (wouldCreateCycle(flowEdges, connection)) {
    return { valid: false, reason: "Connection would create a cycle." };
  }

  return { valid: true };
}
function makeAddedNode(kind: NodeKind, count: number, position?: { x: number; y: number }): FlowNode {
  if (kind === "request") {
    return {
      id: "request-inputs",
      type: "workflowNode",
      position: position ?? { x: 80, y: 220 },
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
      position: position ?? { x: 720, y: 220 },
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
    position: position ?? { x: 560 + count * 32, y: 140 + count * 28 },
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

function formatDurationMs(durationMs: number | null): string {
  if (durationMs === null) return "Running";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

// Formats a run timestamp on the client so it follows the browser's local
// timezone (the API returns an ISO string; the server would otherwise format
// it in UTC on Vercel). The history panel is rendered entirely client-side and
// re-polled every few seconds, so the relative labels stay fresh.
function formatRunTimestamp(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";

  const elapsedMinutes = Math.floor((Date.now() - value.getTime()) / 60000);
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  return value.toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


// Reads a numeric value emitted by a source node's handle, if that handle
// carries a number. Numeric outputs currently originate from a crop node's
// parameter handles; returns null when no numeric value is available.
function readIncomingNumber(sourceNode: FlowNode | undefined, sourceHandle?: string | null): number | null {
  if (!sourceNode) return null;
  if (getPortKind(sourceNode, sourceHandle) !== "number") return null;

  const handle = normalizeHandleId(sourceHandle);
  if (sourceNode.data.kind === "crop" && handle) {
    const field = (Object.keys(CROP_PARAM_HANDLES) as CropParamField[]).find((key) => CROP_PARAM_HANDLES[key] === handle);
    const value = field ? sourceNode.data.crop?.[field] : undefined;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return null;
}

// Resolves the crop node's effective parameters at execution time: for each of
// x/y/width/height, use the value coming in over a connected handle when one is
// wired, otherwise fall back to the manual value in the config panel. Manual
// entry is never disabled — it is simply the fallback.
function resolveCropParams(node: FlowNode, flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  const config = node.data.crop ?? { x: 0, y: 0, width: 100, height: 100 };
  const resolved: Record<CropParamField, number> = { ...config };
  const sources: Record<CropParamField, string> = { x: "manual", y: "manual", width: "manual", height: "manual" };

  for (const field of CROP_PARAM_FIELDS) {
    const incomingEdge = flowEdges.find(
      (item) => item.target === node.id && normalizeHandleId(item.targetHandle) === CROP_PARAM_HANDLES[field],
    );
    if (!incomingEdge) continue;

    const sourceNode = flowNodes.find((item) => item.id === incomingEdge.source);
    const incomingValue = readIncomingNumber(sourceNode, incomingEdge.sourceHandle);
    if (incomingValue === null) continue;

    resolved[field] = incomingValue;
    sources[field] = incomingEdge.source;
  }

  return { resolved, sources };
}

// Image target handles that can receive an upstream image, per node kind.
const IMAGE_INPUT_HANDLES: Partial<Record<NodeKind, string[]>> = {
  crop: ["input-image"],
  gemini: ["image"],
};

// The image (base64 data URL) a source node emits on a given source handle.
function getEmittedImage(sourceNode: FlowNode | undefined, sourceHandle?: string | null): string | undefined {
  if (!sourceNode) return undefined;
  const handle = normalizeHandleId(sourceHandle);
  if (sourceNode.data.kind === "request" && handle === "image_field") return sourceNode.data.imageData;
  if (sourceNode.data.kind === "crop" && handle === "output-image") return sourceNode.data.outputImage;
  return undefined;
}

// Resolves the image arriving at a node's image-input handle from its upstream
// connection, following the same data-flow pattern the request image uses.
function resolveIncomingImage(
  nodeId: string,
  targetHandle: string,
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
): string | undefined {
  const incomingEdge = flowEdges.find(
    (item) => item.target === nodeId && normalizeHandleId(item.targetHandle) === targetHandle,
  );
  if (!incomingEdge) return undefined;
  const sourceNode = flowNodes.find((item) => item.id === incomingEdge.source);
  return getEmittedImage(sourceNode, incomingEdge.sourceHandle);
}

// Crops a base64 image to the given x/y/width/height percentages using a canvas
// (client-side only). Returns a new base64 data URL of the cropped region.
function cropImageToDataUrl(
  src: string,
  region: { x: number; y: number; width: number; height: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const clampPct = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
      const x = clampPct(region.x);
      const y = clampPct(region.y);
      const width = Math.min(clampPct(region.width), 100 - x);
      const height = Math.min(clampPct(region.height), 100 - y);

      const sx = (x / 100) * image.naturalWidth;
      const sy = (y / 100) * image.naturalHeight;
      const sw = Math.max(1, (width / 100) * image.naturalWidth);
      const sh = Math.max(1, (height / 100) * image.naturalHeight);

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL());
    };
    image.onerror = () => reject(new Error("Unable to load image for cropping"));
    image.src = src;
  });
}

function buildNodeResult(node: FlowNode, flowNodes: FlowNode[] = [], flowEdges: FlowEdge[] = []): string {
  const base = {
    nodeId: node.id,
    title: node.data.title,
    type: node.data.kind,
  };

  if (node.data.kind === "crop") {
    const { resolved, sources } = resolveCropParams(node, flowNodes, flowEdges);
    return JSON.stringify({
      ...base,
      crop: resolved,
      cropInputs: sources,
      outputImage: node.data.outputImage ?? null,
    });
  }

  return JSON.stringify(base);
}

function buildIncomingDependencies(targetIds: string[], flowEdges: FlowEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const id of targetIds) {
    map.set(id, []);
  }

  for (const item of flowEdges) {
    if (!targetIds.includes(item.target)) continue;
    if (!targetIds.includes(item.source) && item.source !== "request-inputs") continue;
    map.set(item.target, [...(map.get(item.target) ?? []), item.source]);
  }

  return map;
}

function compareNodeRunOrder(a: string, b: string, flowNodes: FlowNode[]): number {
  const aNode = flowNodes.find((node) => node.id === a);
  const bNode = flowNodes.find((node) => node.id === b);
  const xDiff = (aNode?.position.x ?? 0) - (bNode?.position.x ?? 0);
  if (xDiff !== 0) return xDiff;
  return a.localeCompare(b);
}

function normalizeFlowEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map((item) => {
    const sourceHandle = normalizeHandleId(item.sourceHandle ? String(item.sourceHandle) : null);
    const targetHandle = normalizeHandleId(item.targetHandle ? String(item.targetHandle) : null);
    const kind = item.data?.kind ?? "text";

    return {
      ...item,
      id: String(item.id ?? "").trim() || `${item.source}-${sourceHandle}-${item.target}-${targetHandle}`,
      type: item.type ?? "smoothstep",
      source: String(item.source ?? "").trim(),
      target: String(item.target ?? "").trim(),
      sourceHandle,
      targetHandle,
      animated: item.animated ?? true,
      markerEnd: item.markerEnd ?? { type: MarkerType.ArrowClosed },
      data: { kind, ...(item.data ?? {}) },
      style: item.style ?? { stroke: kind === "image" ? "#7f8bd8" : "#aeb6c4", strokeWidth: 1.75 },
    };
  });
}

export default function WorkflowCanvas({
  workflowId,
  workflowName,
  initialFlow,
}: {
  workflowId: string;
  workflowName: string;
  initialFlow?: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
}) {
  const initialSnapshot = useMemo<Snapshot>(() => {
    if (initialFlow && Array.isArray(initialFlow.nodes) && Array.isArray(initialFlow.edges)) {
      return {
        nodes: normalizeFlowNodes(initialFlow.nodes),
        edges: normalizeFlowEdges(initialFlow.edges),
      };
    }

    return {
      nodes: normalizeFlowNodes(STARTER_NODES),
      edges: [],
    };
  }, [initialFlow]);

  const [nodes, setNodes] = useState<FlowNode[]>(initialSnapshot.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialSnapshot.edges);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftWorkflowName, setDraftWorkflowName] = useState(workflowName);
  const draftWorkflowNameRef = useRef(workflowName);
  const savedWorkflowNameRef = useRef(workflowName);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([...PALETTE_CATEGORIES]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<HistoryRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "success" | "failed">("all");
  const [toast, setToast] = useState("Ready");
  const [connectionToast, setConnectionToast] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const loggedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveRequest, setSaveRequest] = useState(0);
  const latestFlowRef = useRef({ nodes: initialSnapshot.nodes, edges: initialSnapshot.edges });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestFlowRef.current = { nodes, edges };
  }, [edges, nodes]);

  useEffect(() => {
    draftWorkflowNameRef.current = draftWorkflowName;
  }, [draftWorkflowName]);

  const markCanvasChanged = useCallback(() => {
    setSaveStatus("saving");
    setSaveRequest((value) => value + 1);
  }, []);

  const saveWorkflow = useCallback(
    async (showToast = true, nameOverride?: string) => {
      setSaveStatus("saving");
      try {
        const { nodes: latestNodes, edges: latestEdges } = latestFlowRef.current;
        const nextName = (nameOverride ?? draftWorkflowNameRef.current).trim() || workflowName;
        const response = await fetch(`/api/workflow/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: sanitizeNodesForPersistence(latestNodes),
            edges: latestEdges,
            name: nextName,
          }),
        });

        if (!response.ok) {
          throw new Error("Save failed");
        }

        savedWorkflowNameRef.current = nextName;
        setDraftWorkflowName(nextName);
        setSaveStatus("saved");
        if (showToast) {
          setToast(nameOverride ? "Workflow renamed." : "Workflow saved.");
        }
        return true;
      } catch {
        setSaveStatus("error");
        if (showToast) setToast("Unable to save workflow. Check your network.");
        return false;
      }
    },
    [workflowId, workflowName],
  );

  const commitWorkflowName = useCallback(() => {
    const trimmed = draftWorkflowNameRef.current.trim() || workflowName;
    setDraftWorkflowName(trimmed);
    if (trimmed !== savedWorkflowNameRef.current) {
      void saveWorkflow(true, trimmed);
    }
  }, [saveWorkflow, workflowName]);

  const fetchHistoryRuns = useCallback(async () => {
    try {
      const response = await fetch(`/api/runs?workflowId=${encodeURIComponent(workflowId)}`, { method: "GET" });
      if (!response.ok) {
        // Surface the failure instead of swallowing it — keep the last known
        // history visible, but tell the user the panel is not live.
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setHistoryError(payload?.error ?? "Couldn't refresh run history. Retrying…");
        return;
      }
      const payload = (await response.json()) as { runs?: HistoryRun[] };
      if (Array.isArray(payload.runs)) {
        setHistoryRuns(payload.runs);
      }
      setHistoryError(null);
    } catch {
      // Network/parse failure — keep the last known persisted history, but flag it.
      setHistoryError("Couldn't reach the server to refresh run history. Retrying…");
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

        const payload = (await response.json()) as { runId?: string };
        await fetchHistoryRuns();
        return payload.runId;
      } catch {
        setToast("Run complete, but history persistence failed.");
        return undefined;
      }
    },
    [fetchHistoryRuns, workflowId],
  );

  useEffect(() => {
    if (!connectionToast) return;
    const timer = setTimeout(() => setConnectionToast(null), 2600);
    return () => clearTimeout(timer);
  }, [connectionToast]);
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

  // Re-frame the graph after a side panel collapses/expands so the canvas fills
  // the new width with no dead space or clipping. React Flow reflows via its own
  // ResizeObserver; fitView re-centers once the column transition settles.
  useEffect(() => {
    if (!flowInstance) return;
    const timer = window.setTimeout(() => {
      flowInstance.fitView({ padding: 0.2, duration: 300 });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [leftCollapsed, rightCollapsed, flowInstance]);

  // "Starter-only" = a fresh workflow showing just the fixed Request-Inputs +
  // Response nodes, with nothing else added and the sample not yet loaded.
  const isStarterOnlyCanvas = useMemo(
    () => nodes.length === REQUIRED_NODE_IDS.size && nodes.every((node) => REQUIRED_NODE_IDS.has(node.id)),
    [nodes],
  );

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

  // Live map of the upstream image arriving at each node's image-input handle,
  // so nodes can render a thumbnail of what they receive (not just uploads).
  const incomingImages = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};
    for (const node of nodes) {
      const handles = IMAGE_INPUT_HANDLES[node.data.kind];
      if (!handles) continue;
      for (const handle of handles) {
        const image = resolveIncomingImage(node.id, handle, nodes, edges);
        if (image) {
          result[node.id] = { ...(result[node.id] ?? {}), [handle]: image };
        }
      }
    }
    return result;
  }, [nodes, edges]);

  const editorContextValue = useMemo(() => ({ updateNodeData, incomingImages }), [updateNodeData, incomingImages]);

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

  const normalizeConnection = useCallback((connection: Connection): Connection => {
    return {
      ...connection,
      sourceHandle: normalizeHandleId(connection.sourceHandle ? String(connection.sourceHandle) : undefined),
      targetHandle: normalizeHandleId(connection.targetHandle ? String(connection.targetHandle) : undefined),
    };
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection) => validateConnection(normalizeConnection(connection), nodes, edges).valid,
    [edges, nodes, normalizeConnection],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const normalizedConnection = normalizeConnection(connection);
      const validation = validateConnection(normalizedConnection, nodes, edges);

      if (!validation.valid) {
        const message = validation.reason ?? "Connection rejected.";
        setToast(message);
        setConnectionToast(message);
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
            type: "smoothstep",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { kind },
            style: { stroke: kind === "image" ? "#7f8bd8" : "#aeb6c4", strokeWidth: 1.75 },
          },
          current,
        ) as FlowEdge[],
      );
      setToast("Connection added.");
    },
    [edges, markCanvasChanged, nodes, normalizeConnection, pushUndo],
  );
  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      if (kind === "request" && nodes.some((node) => node.id === "request-inputs")) {
        setToast("Request-Inputs is already on the canvas.");
        return;
      }

      if (kind === "response" && nodes.some((node) => node.id === "response")) {
        setToast("Response is already on the canvas.");
        return;
      }

      pushUndo();
      markCanvasChanged();
      const count = nodes.filter((node) => node.data.kind === kind).length + 1;
      setNodes((current) => [...current, makeAddedNode(kind, count, position)]);
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

  const onPaletteDragStart = useCallback((event: DragEvent<HTMLButtonElement>, kind: NodeKind) => {
    event.dataTransfer.setData("application/reactflow", kind);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const onCanvasDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/reactflow") as NodeKind;
      if (!kind || !flowInstance || !flowWrapperRef.current) return;

      const bounds = flowWrapperRef.current.getBoundingClientRect();
      const position = flowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      addNode(kind, position);
    },
    [addNode, flowInstance],
  );

  const filteredPalette = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return NODE_PALETTE.filter((item) => {
      if (!query) return true;
      return `${item.label} ${item.category} ${item.hint} ${item.kind}`.toLowerCase().includes(query);
    });
  }, [paletteQuery]);

  const groupedPalette = useMemo(
    () => PALETTE_CATEGORIES.map((category) => ({ category, items: filteredPalette.filter((item) => item.category === category) })),
    [filteredPalette],
  );

  // Grouped node list for the searchable picker modal. Mirrors the sidebar
  // grouping (same NODE_PALETTE / categories); only empty categories are hidden
  // while searching.
  const pickerGroups = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return PALETTE_CATEGORIES.map((category) => ({
      category,
      items: NODE_PALETTE.filter(
        (item) =>
          item.category === category &&
          (!query || `${item.label} ${item.category} ${item.hint} ${item.kind}`.toLowerCase().includes(query)),
      ),
    })).filter((group) => group.items.length > 0);
  }, [pickerQuery]);

  const pickerHasQuery = pickerQuery.trim().length > 0;

  // Presentation-only filter over the same polled history data.
  const filteredHistoryRuns = useMemo(() => {
    if (historyFilter === "all") return historyRuns;
    return historyRuns.filter((run) => run.status === historyFilter);
  }, [historyRuns, historyFilter]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyOpen]);

  const openNodePicker = useCallback(() => {
    setPickerQuery("");
    setExpandedCategories([...PALETTE_CATEGORIES]);
    setPickerOpen(true);
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }, []);

  const handlePickNode = useCallback(
    (kind: NodeKind) => {
      // Reuse the existing add-to-canvas behavior unchanged (adds near the
      // default drop position, same as a sidebar click today).
      addNode(kind);
      setPickerOpen(false);
    },
    [addNode],
  );

  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickerOpen]);
  const loadSampleWorkflow = useCallback(() => {
    pushUndo();
    markCanvasChanged();
    setNodes(normalizeFlowNodes(SAMPLE_NODES));
    setEdges(normalizeFlowEdges(SAMPLE_EDGES));
    setToast("Sample workflow loaded with connected edges.");
    window.setTimeout(() => {
      flowInstance?.fitView({ padding: 0.18, duration: 300 });
    }, 60);
  }, [flowInstance, markCanvasChanged, pushUndo]);

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
      const runnableIds = targetIds.filter((id) => id !== "request-inputs");
      const nodeResults = new Map<string, PersistedNodeRun>();
      const recordNodeResult = (nodeId: string, startedAt: Date, completedAt: Date, overrideNode?: FlowNode) => {
        const node = overrideNode ?? nodes.find((item) => item.id === nodeId);
        if (!node) return;

        nodeResults.set(nodeId, {
          id: nodeId,
          title: node.data.title,
          type: node.data.kind,
          status: "success",
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          output: buildNodeResult(node, nodes, edges),
        });
      };

      const incomingDependencies = buildIncomingDependencies(targetIds, edges);

      const isReady = (nodeId: string, completed: Set<string>) => {
        const deps = incomingDependencies.get(nodeId) ?? [];
        if (deps.length === 0) {
          return completed.has("request-inputs") || !targetIds.includes("request-inputs");
        }
        return deps.every((sourceId) => completed.has(sourceId));
      };

      const simulatedRunDelayMs = (nodeId: string) => {
        const nodeKind = nodes.find((node) => node.id === nodeId)?.data.kind;
        if (nodeKind === "crop") return 31800;
        if (nodeKind === "gemini") return 4200;
        return 100;
      };

      const completed = new Set<string>();
      const running = new Set<string>();

      const completeRun = () => {
        const runCompletedAt = new Date();
        const runScope: PersistedRun["scope"] = scope === "full" ? "full" : scope === "selected" ? "partial" : "single";
        const persistedRun: PersistedRun = {
          scope: runScope,
          status: "success",
          startedAt: runStartedAt.toISOString(),
          completedAt: runCompletedAt.toISOString(),
          nodes: targetIds.flatMap((id) => {
            const result = nodeResults.get(id);
            return result ? [result] : [];
          }),
        };

        setToast("Run complete. Saving history...");
        void persistRun(persistedRun).then((runId) => {
          if (runId) {
            setExpandedRun(runId);
            setToast("Run complete. History entry saved.");
          }
        });
      };

      const runSingleNode = (nodeId: string) => {
        running.add(nodeId);
        updateNodeRunState([nodeId], "running");
        const nodeStartedAt = new Date();
        timerRef.current.push(
          setTimeout(() => {
            void (async () => {
              running.delete(nodeId);
              const node = nodes.find((item) => item.id === nodeId);

              // Crop execution: crop the upstream image by the resolved
              // x/y/width/height. We await the result before completing the node
              // so the cropped image is set on state, recorded in the run output,
              // and visible in the node's Output Image thumbnail.
              let croppedImage: string | undefined;
              if (node?.data.kind === "crop") {
                const inputImage = resolveIncomingImage(nodeId, "input-image", nodes, edges);
                if (inputImage) {
                  const { resolved } = resolveCropParams(node, nodes, edges);
                  try {
                    croppedImage = await cropImageToDataUrl(inputImage, resolved);
                  } catch (error) {
                    console.error(`[crop] Failed to crop image for node ${nodeId}`, error);
                    setToast("Crop failed: the input image could not be processed.");
                  }
                }
              }

              completed.add(nodeId);
              const nodeCompletedAt = new Date();

              // A node object reflecting the freshly cropped output, so both the
              // recorded run result and the live thumbnail read the same image.
              const effectiveNode =
                node && croppedImage
                  ? { ...node, data: { ...node.data, outputImage: croppedImage } }
                  : node;

              if (croppedImage) {
                setNodes((current) =>
                  current.map((item) =>
                    item.id === nodeId ? { ...item, data: { ...item.data, outputImage: croppedImage } } : item,
                  ),
                );
              }

              recordNodeResult(nodeId, nodeStartedAt, nodeCompletedAt, effectiveNode ?? undefined);
              updateNodeRunState([nodeId], "success", {
                duration: formatDurationMs(nodeCompletedAt.getTime() - nodeStartedAt.getTime()),
                runOutput: effectiveNode ? buildRunOutput(effectiveNode, nodes, edges) : undefined,
              });

              scheduleNext();
            })();
          }, simulatedRunDelayMs(nodeId)),
        );
      };

      const scheduleNext = () => {
        const readyNodes = runnableIds
          .filter((id) => !completed.has(id) && !running.has(id) && isReady(id, completed))
          .sort((a, b) => compareNodeRunOrder(a, b, nodes));

        if (readyNodes.length === 0) {
          if (running.size === 0) completeRun();
          return;
        }

        runSingleNode(readyNodes[0]);
      };

      setToast("Run started. Nodes execute one at a time in dependency order.");
      timerRef.current.push(
        setTimeout(() => {
          if (targetIds.includes("request-inputs")) {
            updateNodeRunState(["request-inputs"], "running");
            timerRef.current.push(
              setTimeout(() => {
                const nodeStartedAt = new Date();
                const nodeCompletedAt = new Date();
                const node = nodes.find((item) => item.id === "request-inputs");
                completed.add("request-inputs");
                recordNodeResult("request-inputs", nodeStartedAt, nodeCompletedAt);
                updateNodeRunState(["request-inputs"], "success", {
                  duration: formatDurationMs(nodeCompletedAt.getTime() - nodeStartedAt.getTime()),
                  runOutput: node ? buildRunOutput(node, nodes, edges) : undefined,
                });
                scheduleNext();
              }, 150),
            );
            return;
          }

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
    saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : "Unsaved";
  const saveStatusTone =
    saveStatus === "error" ? "bg-[#fff1f1] text-[#a83232]" : saveStatus === "saved" ? "bg-[#ecf8ef] text-[#257942]" : "bg-[#f3f2ee] text-[#55524b]";

  return (
    <WorkflowEditorContext.Provider value={editorContextValue}>
      <main className="h-screen overflow-hidden bg-[#f7f8fa] text-[14px] text-[#171717]">
        <div
          className="grid h-full transition-[grid-template-columns] duration-200 ease-out"
          style={{
            gridTemplateColumns: `${leftCollapsed ? "56px" : "280px"} minmax(0,1fr) ${rightCollapsed ? "0px" : "340px"}`,
          }}
        >
          <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#e3e7ee] bg-[#f7f8fa]">
            {leftCollapsed ? (
              <div className="flex min-h-0 flex-1 flex-col items-center">
                <div className="flex flex-col items-center gap-3 border-b border-[#e8ecf2] px-2 py-4">
                  <button
                    type="button"
                    onClick={() => setLeftCollapsed(false)}
                    title="Expand Flow panel"
                    aria-label="Expand Flow panel"
                    className="grid size-9 place-items-center rounded-[8px] border border-[#e5e5e5] bg-white text-[#404040] transition hover:bg-[#fafafa]"
                  >
                    <PanelChevron pointing="right" />
                  </button>
                  <button
                    type="button"
                    onClick={openNodePicker}
                    title="Add node"
                    aria-label="Add node"
                    className="grid size-9 place-items-center rounded-[8px] bg-[#171717] text-[18px] leading-none text-white transition hover:bg-[#404040]"
                  >
                    +
                  </button>
                  <div className="grid size-8 place-items-center rounded-[10px] bg-[#171717] text-[11px] font-semibold text-white">M</div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-3">
                  {NODE_PALETTE.map((item) => {
                    const meta = NODE_KIND_META[item.kind];
                    return (
                      <button
                        key={`rail-${item.label}`}
                        draggable
                        onClick={() => addNode(item.kind)}
                        onDragStart={(event) => onPaletteDragStart(event, item.kind)}
                        title={item.label}
                        aria-label={item.label}
                        className="grid size-9 shrink-0 cursor-grab place-items-center rounded-md border border-[#e1e6ef] bg-white text-[11px] font-semibold text-white transition hover:border-[#2563eb] active:cursor-grabbing"
                        style={{ backgroundColor: meta.accent }}
                      >
                        {item.icon}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
            <div className="border-b border-[#e8ecf2] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-[10px] bg-[#171717] text-[11px] font-semibold text-white">M</div>
                  <div className="min-w-0">
                    <h1 className="truncate text-[14px] font-semibold text-[#171717]">Flow</h1>
                    <p className="text-[11px] text-[#737373]">Drag nodes, connect ports on the canvas</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLeftCollapsed(true)}
                  title="Collapse Flow panel"
                  aria-label="Collapse Flow panel"
                  className="grid size-7 shrink-0 place-items-center rounded-[8px] border border-[#e5e5e5] bg-white text-[#404040] transition hover:bg-[#fafafa]"
                >
                  <PanelChevron pointing="left" />
                </button>
              </div>
              <input
                className="mt-4 w-full rounded-[10px] border border-[#e5e5e5] bg-white px-3 py-2 text-[14px] text-[#171717] outline-none transition focus:border-[#6366f1]"
                placeholder="Search node types"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
              />
              <button
                type="button"
                onClick={openNodePicker}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#171717] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#404040]"
              >
                <span className="text-[15px] leading-none">+</span>
                Add node
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {groupedPalette.every((group) => group.items.length === 0) ? (
                <div className="grid min-h-[220px] place-items-center rounded-md border border-dashed border-[#d9dee8] bg-[#f9fafb] p-5 text-center">
                  <div>
                    <div className="mx-auto grid size-10 place-items-center rounded-full bg-[#eef4ff] text-[12px] font-semibold text-[#2563eb]">SR</div>
                    <p className="mt-3 text-[14px] font-medium text-[#111827]">No nodes found</p>
                    <p className="mt-1 text-[12px] text-[#6b7280]">Try a different search term.</p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-5">
                {groupedPalette.map((group) =>
                  group.items.length ? (
                    <section key={group.category}>
                      <h2 className="mb-2 text-[12px] font-semibold uppercase text-[#6b7280]">{group.category}</h2>
                      <div className="space-y-2">
                        {group.items.map((item) => {
                          const meta = NODE_KIND_META[item.kind];
                          return (
                            <button
                              key={`${group.category}-${item.label}`}
                              draggable
                              className="flex w-full cursor-grab items-center gap-3 rounded-md border border-[#e1e6ef] bg-white px-3 py-2.5 text-left transition hover:border-[#2563eb] hover:bg-[#f8fbff] active:cursor-grabbing"
                              onClick={() => addNode(item.kind)}
                              onDragStart={(event) => onPaletteDragStart(event, item.kind)}
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#eef4ff] text-[11px] font-semibold text-[#1d4ed8]">{item.icon}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium text-[#111827]">{item.label}</span>
                                <span className="block truncate text-[11px] text-[#6b7280]">{item.hint}</span>
                              </span>
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: meta.accent }}>
                                {meta.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null,
                )}
              </div>
            </div>

            <div className="border-t border-[#edf0f5] p-4">
              <div className="rounded-md border border-[#e1e6ef] bg-[#f9fafb] p-3">
                <div className="text-[12px] font-semibold text-[#374151]">Status</div>
                <p className="mt-1 text-[12px] text-[#6b7280]">{toast}</p>
              </div>
            </div>
              </>
            )}
          </aside>

          <section className="relative min-w-0 bg-white" ref={flowWrapperRef} onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
            <div className="absolute inset-x-0 top-0 z-20 border-b border-[#e8ecf2] bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <a className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717]" href="/dashboard">
                  Dashboard
                </a>
                <input
                  className="min-w-0 flex-1 rounded-[10px] border border-[#e5e5e5] bg-[#fafafa] px-3 py-1.5 text-[14px] font-semibold text-[#171717] outline-none focus:border-[#6366f1] focus:bg-white"
                  value={draftWorkflowName}
                  onChange={(event) => setDraftWorkflowName(event.target.value)}
                  onBlur={commitWorkflowName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      setDraftWorkflowName(savedWorkflowNameRef.current);
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label="Workflow name"
                  title="Edit workflow name (Enter to save, Escape to cancel)"
                />
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${saveStatusTone}`}>{saveStatusText}</span>
                <button className="rounded-[10px] bg-[#171717] px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-[#404040]" onClick={() => runWorkflow("full")}>
                  Run
                </button>
                <button className="rounded-[10px] border border-[#e5e5e5] px-3 py-2 text-[12px] font-medium text-[#404040] transition hover:border-[#d4d4d4] hover:bg-[#fafafa]" onClick={() => runWorkflow("selected")}>
                  Run selected
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  title="Execution history"
                  aria-label="Execution history"
                  className="grid size-9 place-items-center rounded-[10px] border border-[#e5e5e5] text-[#404040] transition hover:border-[#d4d4d4] hover:bg-[#fafafa]"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 3v5h5" />
                    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </button>
                <div className="relative">
                  <button className="grid size-9 place-items-center rounded-[10px] border border-[#e5e5e5] text-[16px] font-semibold text-[#404040] transition hover:bg-[#fafafa]" onClick={() => setMenuOpen((value) => !value)} aria-label="Workflow menu">
                    ...
                  </button>
                  {menuOpen ? (
                    <div className="absolute right-0 top-11 z-30 w-44 rounded-md border border-[#d9dee8] bg-white p-1 shadow-lg">
                      <button className="w-full rounded px-3 py-2 text-left text-[12px] text-[#374151] hover:bg-[#f3f6fb]" onClick={exportJson}>Export JSON</button>
                      <button className="w-full rounded px-3 py-2 text-left text-[12px] text-[#374151] hover:bg-[#f3f6fb]" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
                      <button className="w-full rounded px-3 py-2 text-left text-[12px] text-[#374151] hover:bg-[#f3f6fb]" onClick={loadSampleWorkflow}>Load sample</button>
                      <button className="w-full rounded px-3 py-2 text-left text-[12px] text-[#a83232] hover:bg-[#fff1f1]" onClick={deleteSelected}>Delete selected</button>
                    </div>
                  ) : null}
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
            </div>

            {rightCollapsed ? (
              <button
                type="button"
                onClick={() => setRightCollapsed(false)}
                title="Expand Inspector panel"
                aria-label="Expand Inspector panel"
                className="absolute right-4 top-[70px] z-20 flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-2.5 py-2 text-[12px] font-medium text-[#404040] shadow-sm transition hover:bg-[#fafafa]"
              >
                <PanelChevron pointing="left" />
                <span>Inspector</span>
                {selectedNode ? (
                  <span className="size-1.5 rounded-full bg-[#2563eb]" title="Node config available" aria-hidden />
                ) : null}
              </button>
            ) : null}

            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onInit={setFlowInstance}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2.5}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
              nodesDraggable
              nodesConnectable
              defaultEdgeOptions={{ type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.75, stroke: "#aeb6c4" } }}
              connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}
              connectionLineType={ConnectionLineType.SmoothStep}
            >
              <Background color="#d8dde6" gap={20} size={1} variant={BackgroundVariant.Dots} />
              <Controls position="bottom-left" showInteractive={false} showFitView={false}>
                <ControlButton
                  onClick={() => flowInstance?.fitView({ padding: 0.2, duration: 300 })}
                  title="Fit view"
                  aria-label="Fit view"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
                  </svg>
                </ControlButton>
              </Controls>
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                maskColor="rgba(247, 248, 250, 0.72)"
                nodeBorderRadius={8}
                nodeColor={(node) => NODE_KIND_META[(node.data?.kind as NodeKind) ?? "request"]?.accent ?? "#2563eb"}
              />
            </ReactFlow>

            {connectionToast ? (
              <div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-md border border-[#fecaca] bg-white px-4 py-2 text-[14px] font-medium text-[#991b1b] shadow-lg">
                {connectionToast}
              </div>
            ) : null}
            {nodes.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center pt-16">
                <div className="rounded-md border border-dashed border-[#cfd7e6] bg-white/92 px-8 py-6 text-center shadow-sm">
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#eef4ff] text-[12px] font-semibold text-[#2563eb]">CN</div>
                  <p className="mt-3 text-[14px] font-semibold text-[#111827]">Canvas is empty</p>
                  <p className="mt-1 text-[12px] text-[#6b7280]">Drag a node from the palette to start building.</p>
                </div>
              </div>
            ) : null}

            {isStarterOnlyCanvas ? (
              <div className="pointer-events-none absolute left-1/2 top-6 z-[6] -translate-x-1/2">
                <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-[#dbe3f2] bg-white/95 px-6 py-5 text-center shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur-sm">
                  <div>
                    <p className="text-[15px] font-semibold text-[#111827]">Start with a sample workflow</p>
                    <p className="mt-1 text-[12px] text-[#6b7280]">See a connected example with Request-Inputs, processing, and Response.</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadSampleWorkflow}
                    className="rounded-md bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8]"
                  >
                    Load Sample Workflow
                  </button>
                </div>
              </div>
            ) : null}

            <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[8px] border border-[#e3e7ee] bg-white px-2 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
              <button className="rounded-md border border-[#d9dee8] px-3 py-2 text-[12px] font-medium text-[#374151] hover:border-[#2563eb]" disabled={undoStack.length === 0} onClick={undo}>
                Undo
              </button>
              <button className="rounded-md border border-[#d9dee8] px-3 py-2 text-[12px] font-medium text-[#374151] hover:border-[#2563eb]" disabled={redoStack.length === 0} onClick={redo}>
                Redo
              </button>
              <button className="rounded-md border border-[#d9dee8] px-3 py-2 text-[12px] font-medium text-[#374151] hover:border-[#2563eb]" disabled={saveStatus === "saving"} onClick={() => void saveWorkflow()}>
                Save
              </button>
              <button className="rounded-md border border-[#d9dee8] px-3 py-2 text-[12px] font-medium text-[#374151] hover:border-[#2563eb]" onClick={() => runWorkflow("single")}>
                Run node
              </button>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[#e3e7ee] bg-white">
            <div className="flex h-full min-h-0 w-[340px] flex-col">
            <div className="flex items-center justify-between border-b border-[#edf0f5] px-4 py-2.5">
              <span className="text-[12px] font-semibold text-[#374151]">Inspector</span>
              <button
                type="button"
                onClick={() => setRightCollapsed(true)}
                title="Collapse Inspector panel"
                aria-label="Collapse Inspector panel"
                className="grid size-7 shrink-0 place-items-center rounded-[8px] border border-[#e5e5e5] bg-white text-[#404040] transition hover:bg-[#fafafa]"
              >
                <PanelChevron pointing="right" />
              </button>
            </div>
            <div className="border-b border-[#edf0f5] p-4">
              <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} />
            </div>
            </div>
          </aside>
        </div>

        <div className={`fixed inset-0 z-40 ${historyOpen ? "" : "pointer-events-none"}`} aria-hidden={!historyOpen}>
          <div
            className={`absolute inset-0 bg-[rgba(15,23,42,0.25)] transition-opacity duration-300 ${historyOpen ? "opacity-100" : "opacity-0"}`}
            onClick={() => setHistoryOpen(false)}
          />
          <aside
            className={`absolute right-0 top-0 flex h-full w-full max-w-[380px] flex-col border-l border-[#e3e7ee] bg-white shadow-[-8px_0_30px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${historyOpen ? "translate-x-0" : "translate-x-full"}`}
            role="dialog"
            aria-modal="true"
            aria-label="Execution History"
          >
            <div className="flex items-center justify-between border-b border-[#edf0f5] px-4 py-3">
              <h2 className="text-[15px] font-semibold text-[#111827]">Execution History</h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-md border border-[#e5e5e5] px-3 py-1.5 text-[12px] font-medium text-[#404040] transition hover:bg-[#fafafa]"
              >
                Close
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#edf0f5] px-4 py-3">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">Run history</span>
              <select
                value={historyFilter}
                onChange={(event) => setHistoryFilter(event.target.value as "all" | "success" | "failed")}
                aria-label="Filter runs by status"
                className="rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#374151] outline-none transition focus:border-[#6366f1]"
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {historyError ? (
              <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-[#f5d3b0] bg-[#fff8f0] px-3 py-2 text-[12px] text-[#9a5b16]">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-[#e08a2b]" />
                <span>{historyError}</span>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {filteredHistoryRuns.length === 0 ? (
                <div className="grid min-h-[220px] place-items-center rounded-md border border-dashed border-[#d9dee8] bg-[#f9fafb] p-5 text-center">
                  <div>
                    <div className="mx-auto grid size-10 place-items-center rounded-full bg-[#eef4ff] text-[12px] font-semibold text-[#2563eb]">RH</div>
                    <p className="mt-3 text-[14px] font-medium text-[#111827]">{historyRuns.length === 0 ? "No runs yet" : "No matching runs"}</p>
                    <p className="mt-1 text-[12px] text-[#6b7280]">{historyRuns.length === 0 ? "Run the workflow to populate history." : "Try a different filter."}</p>
                  </div>
                </div>
              ) : null}

              {filteredHistoryRuns.map((run) => {
                const expanded = expandedRun === run.id;
                const dotClass = run.status === "success" ? "bg-[#16a34a]" : run.status === "failed" ? "bg-[#dc2626]" : "bg-[#f59e0b]";
                return (
                  <div key={run.id} className="rounded-md border border-[#e1e6ef] bg-white">
                    <button className="w-full px-3 py-3 text-left" onClick={() => setExpandedRun(expanded ? null : run.id)}>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                        <span className={`size-2.5 rounded-full ${dotClass}`} />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-[#111827]">{draftWorkflowName}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#6b7280]">
                            <span>{formatRunTimestamp(run.startedAt)}</span>
                            <span>{run.nodeCount} {run.nodeCount === 1 ? "node" : "nodes"}</span>
                          </div>
                        </div>
                        <span className="rounded-full bg-[#f3f6fb] px-2 py-1 text-[11px] font-medium text-[#374151]">{formatDurationMs(run.durationMs)}</span>
                      </div>
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                      <div className="overflow-hidden">
                        <div className="border-t border-[#edf0f5] px-3 py-3">
                          {run.nodes.length === 0 ? (
                            <div className="grid min-h-[96px] place-items-center rounded-md bg-[#f9fafb] text-center">
                              <div>
                                <div className="mx-auto grid size-8 place-items-center rounded-full bg-[#eef4ff] text-[11px] font-semibold text-[#2563eb]">NR</div>
                                <p className="mt-2 text-[12px] text-[#6b7280]">No node output recorded.</p>
                              </div>
                            </div>
                          ) : null}
                          {run.nodes.map((node) => (
                            <div key={`${run.id}-${node.id}`} className="grid grid-cols-[auto_1fr] gap-2 py-1.5 text-[12px]">
                              <span className={`mt-1 size-2 rounded-full ${node.status === "success" ? "bg-[#16a34a]" : node.status === "failed" ? "bg-[#dc2626]" : "bg-[#f59e0b]"}`} />
                              <div className="min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium text-[#374151]">{node.title}</span>
                                  <span className="shrink-0 rounded-full bg-[#f3f6fb] px-2 py-0.5 text-[11px] text-[#6b7280]">{formatDurationMs(node.durationMs)}</span>
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-[#6b7280]">{node.output}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        {pickerOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,23,42,0.35)] p-4 pt-[10vh]"
            role="dialog"
            aria-modal="true"
            aria-label="Add a node"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[14px] border border-[#e3e7ee] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.25)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[#eef0f4] p-3">
                <input
                  autoFocus
                  className="w-full rounded-[10px] border border-[#e5e5e5] bg-[#fafafa] px-3 py-2.5 text-[14px] text-[#171717] outline-none transition focus:border-[#6366f1] focus:bg-white"
                  placeholder="Search nodes or models..."
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {pickerGroups.length === 0 ? (
                  <div className="grid min-h-[160px] place-items-center text-center">
                    <div>
                      <p className="text-[14px] font-medium text-[#111827]">No nodes found</p>
                      <p className="mt-1 text-[12px] text-[#6b7280]">Try a different search term.</p>
                    </div>
                  </div>
                ) : (
                  pickerGroups.map((group) => {
                    const open = pickerHasQuery || expandedCategories.includes(group.category);
                    return (
                      <div key={`picker-${group.category}`} className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleCategory(group.category)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition hover:bg-[#f5f7fb]"
                          aria-expanded={open}
                        >
                          <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                            {group.category}
                          </span>
                          <span className="flex items-center gap-2 text-[11px] text-[#9aa1ad]">
                            {group.items.length}
                            <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
                              <PanelChevron pointing="right" />
                            </span>
                          </span>
                        </button>

                        {open ? (
                          <div className="mt-1 space-y-1">
                            {group.items.map((item) => {
                              const meta = NODE_KIND_META[item.kind];
                              return (
                                <button
                                  key={`picker-${group.category}-${item.label}`}
                                  type="button"
                                  onClick={() => handlePickNode(item.kind)}
                                  className="flex w-full items-center gap-3 rounded-md border border-transparent px-2.5 py-2 text-left transition hover:border-[#dbe3f2] hover:bg-[#f8fbff]"
                                >
                                  <span className="grid size-8 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-white" style={{ backgroundColor: meta.accent }}>
                                    {item.icon}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-medium text-[#111827]">{item.label}</span>
                                    <span className="block truncate text-[11px] text-[#6b7280]">{item.hint}</span>
                                  </span>
                                  <span className="shrink-0 rounded-full bg-[#f3f6fb] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
                                    {meta.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </WorkflowEditorContext.Provider>
  );
}






