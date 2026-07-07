"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useWorkflowEditor } from "./context";
import type { FlowNodeData, PortKind, RunStatus } from "./types";

const NODE_KIND_META: Record<
  FlowNodeData["kind"],
  { label: string; accent: string; softBg: string; icon: string }
> = {
  request: { label: "Request", accent: "#2563eb", softBg: "#eff6ff", icon: "IN" },
  crop: { label: "Transform", accent: "#7c3aed", softBg: "#f5f3ff", icon: "CR" },
  gemini: { label: "LLM", accent: "#6366f1", softBg: "#eef2ff", icon: "AI" },
  response: { label: "Response", accent: "#059669", softBg: "#ecfdf5", icon: "OUT" },
};

function statusClass(status: RunStatus = "idle") {
  if (status === "running") return "workflow-node--running";
  if (status === "success") return "workflow-node--success";
  if (status === "error") return "workflow-node--error";
  return "";
}

function StatusBadge({ status = "idle" }: { status?: RunStatus }) {
  if (status === "running") {
    return (
      <div className="workflow-node-status workflow-node-status--running">
        <span className="node-spinner" aria-hidden />
        Running
      </div>
    );
  }

  if (status === "success") {
    return <div className="workflow-node-status workflow-node-status--success">Done</div>;
  }

  if (status === "error") {
    return <div className="workflow-node-status workflow-node-status--error">Error</div>;
  }

  return null;
}

function compact(value?: string, fallback = "Not configured") {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 54 ? `${trimmed.slice(0, 54)}...` : trimmed;
}

function truncateOutput(value: string, max = 120) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function ExecutionOutputSection({ data }: { data: FlowNodeData }) {
  const [expanded, setExpanded] = useState(false);
  const status = data.status ?? "idle";
  const hasRunOutput = status !== "idle";
  const preview =
    status === "error"
      ? data.runError ?? "Execution failed."
      : data.runOutput ?? data.output ?? "No output captured.";

  return (
    <footer className="workflow-node-footer">
      <button
        type="button"
        className="nodrag nopan nowheel workflow-node-footer-toggle"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Output</span>
        <span className="workflow-node-footer-hint">{expanded ? "Hide" : "Show"}</span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {hasRunOutput ? (
            <div className="nodrag nopan nowheel workflow-node-output">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={status} />
                {data.duration ? <span className="text-[11px] text-[#737373]">{data.duration}</span> : null}
              </div>
              <pre className="workflow-node-output-text">{truncateOutput(preview, 280)}</pre>
            </div>
          ) : (
            <div className="workflow-node-output-empty">
              <p>Output appears after execution.</p>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}

function PortRow({
  id,
  type,
  label,
  kind,
  side,
  detail,
  param = false,
}: {
  id: string;
  type: "source" | "target";
  label: string;
  kind: PortKind;
  side: "left" | "right";
  detail?: string;
  param?: boolean;
}) {
  const position = side === "left" ? Position.Left : Position.Right;
  const handleClass = `workflow-handle workflow-handle--${kind}${param ? " workflow-handle--param" : ""}`;

  return (
    <div className={`workflow-port workflow-port--${side}${param ? " workflow-port--param" : ""}`}>
      {side === "left" ? (
        <Handle id={id} type={type} position={position} className={handleClass} />
      ) : null}
      <div className="workflow-port-copy">
        <span className="workflow-port-label">{label}</span>
        {detail ? <span className="workflow-port-detail">{detail}</span> : null}
      </div>
      {side === "right" ? (
        <Handle id={id} type={type} position={position} className={handleClass} />
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="workflow-info-row">
      <span className="workflow-info-label">{label}</span>
      <span className="workflow-info-value">{value}</span>
    </div>
  );
}

function EditableTitle({ nodeId, title }: { nodeId: string; title: string }) {
  const { updateNodeData } = useWorkflowEditor();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (editing) return;
    const timer = setTimeout(() => setDraft(title), 0);
    return () => clearTimeout(timer);
  }, [editing, title]);

  const commit = useCallback(() => {
    const next = draft.trim() || title;
    updateNodeData(nodeId, { title: next });
    setDraft(next);
    setEditing(false);
  }, [draft, nodeId, title, updateNodeData]);

  if (editing) {
    return (
      <input
        className="nodrag nopan nowheel workflow-node-title-input"
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="nodrag nopan nowheel workflow-node-title"
      title="Click to rename"
      onClick={() => setEditing(true)}
    >
      {title}
    </button>
  );
}

function ImageThumb({ src, alt }: { src: string; alt: string }) {
  // Same thumbnail rendering the Request-Inputs image_field uses.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="mt-1 h-16 w-full rounded-md border border-[#e5e5e5] object-cover" />;
}

export default function WorkflowNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const { incomingImages } = useWorkflowEditor();
  const isCrop = data.kind === "crop";
  const isGemini = data.kind === "gemini";
  const isRequest = data.kind === "request";
  const isResponse = data.kind === "response";
  const crop = useMemo(() => data.crop ?? { x: 0, y: 0, width: 100, height: 100 }, [data.crop]);
  const status = data.status ?? "idle";
  const meta = NODE_KIND_META[data.kind];
  const nodeIncomingImages = incomingImages[id] ?? {};

  return (
    <div
      className={`workflow-node ${statusClass(status)} ${selected ? "workflow-node--selected" : ""}`}
      data-kind={data.kind}
      style={{ ["--node-accent" as string]: meta.accent, ["--node-accent-soft" as string]: meta.softBg }}
    >
      <div className="workflow-node-accent" aria-hidden />

      <header className="workflow-node-header">
        <div className="workflow-node-icon">{meta.icon}</div>
        <div className="min-w-0 flex-1">
          <EditableTitle nodeId={id} title={data.title} />
          <div className="workflow-node-meta">
            <span className="workflow-node-category">{meta.label}</span>
            {data.fixed ? <span className="workflow-node-locked">Locked</span> : null}
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      <section className="workflow-node-body">
        {isRequest ? (
          <div className="workflow-node-stack">
            <PortRow id="text_field" type="source" side="right" label="text_field" kind="text" detail={compact(data.output, "Text input")} />
            <PortRow id="image_field" type="source" side="right" label="image_field" kind="image" detail={data.imageData ? "Image attached" : "Image input"} />
            {data.imageData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.imageData}
                alt="image_field preview"
                className="mt-1 h-16 w-full rounded-md border border-[#e5e5e5] object-cover"
              />
            ) : null}
          </div>
        ) : null}

        {isCrop ? (
          <div className="workflow-node-stack">
            <PortRow
              id="input-image"
              type="target"
              side="left"
              label="Input Image"
              kind="image"
              detail={nodeIncomingImages["input-image"] ? "Image received" : undefined}
            />
            {nodeIncomingImages["input-image"] ? (
              <ImageThumb src={nodeIncomingImages["input-image"]} alt="Input image preview" />
            ) : null}
            <div className="workflow-node-params">
              <PortRow id="crop-x" type="target" side="left" label="x" kind="number" param detail={`${crop.x}`} />
              <PortRow id="crop-y" type="target" side="left" label="y" kind="number" param detail={`${crop.y}`} />
              <PortRow id="crop-width" type="target" side="left" label="width" kind="number" param detail={`${crop.width}`} />
              <PortRow id="crop-height" type="target" side="left" label="height" kind="number" param detail={`${crop.height}`} />
            </div>
            <InfoRow label="Crop" value={`${crop.x}, ${crop.y}, ${crop.width} x ${crop.height}%`} />
            <InfoRow label="Wait" value="30+ sec" />
            <PortRow
              id="output-image"
              type="source"
              side="right"
              label="Output Image"
              kind="image"
              detail={data.outputImage ? "Cropped result" : undefined}
            />
            {data.outputImage ? (
              <ImageThumb src={data.outputImage} alt="Cropped output preview" />
            ) : null}
          </div>
        ) : null}

        {isGemini ? (
          <div className="workflow-node-stack">
            <PortRow id="prompt" type="target" side="left" label="Prompt" kind="text" detail={compact(data.prompt, "Prompt input")} />
            <PortRow
              id="image"
              type="target"
              side="left"
              label="Image"
              kind="image"
              detail={nodeIncomingImages["image"] ? "Image received" : "Optional vision input"}
            />
            {nodeIncomingImages["image"] ? (
              <ImageThumb src={nodeIncomingImages["image"]} alt="Vision image preview" />
            ) : null}
            <InfoRow label="System" value={compact(data.systemPrompt, "System prompt")} />
            <InfoRow label="Model" value="Gemini 3.1 Pro" />
            <PortRow id="response" type="source" side="right" label="Response" kind="text" />
          </div>
        ) : null}

        {isResponse ? (
          <div className="workflow-node-stack">
            <PortRow id="result" type="target" side="left" label="result" kind="text" detail={compact(data.output, "Final output")} />
          </div>
        ) : null}
      </section>

      <ExecutionOutputSection data={data} />
    </div>
  );
}
