"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useWorkflowEditor } from "./context";
import type { FlowNodeData, PortKind, RunStatus } from "./types";

const NODE_KIND_META: Record<FlowNodeData["kind"], { label: string; icon: string; className: string }> = {
  request: { label: "HTTP", icon: "IN", className: "bg-[#dbeafe] text-[#1d4ed8]" },
  crop: { label: "Transform", icon: "TR", className: "bg-[#ede9fe] text-[#6d28d9]" },
  gemini: { label: "AI", icon: "AI", className: "bg-[#ede9fe] text-[#6d28d9]" },
  response: { label: "Output", icon: "OUT", className: "bg-[#dcfce7] text-[#15803d]" },
};

function statusClass(status: RunStatus = "idle") {
  if (status === "running") return "node-running";
  if (status === "success") return "node-success";
  if (status === "error") return "node-error";
  return "node-idle";
}

function StatusBadge({ status = "idle" }: { status?: RunStatus }) {
  if (status === "running") {
    return (
      <div className="flex items-center gap-1 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-medium text-[#1d4ed8]">
        <span className="node-spinner" aria-hidden />
        Running
      </div>
    );
  }

  if (status === "success") {
    return <div className="rounded-full bg-[#ecf8ef] px-2 py-0.5 text-[11px] font-medium text-[#257942]">Done</div>;
  }

  if (status === "error") {
    return <div className="rounded-full bg-[#fdecec] px-2 py-0.5 text-[11px] font-medium text-[#a83232]">Error</div>;
  }

  return <div className="rounded-full bg-[#f3f6fb] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">Idle</div>;
}

function truncateOutput(value: string, max = 120) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function ExecutionOutputSection({ data }: { data: FlowNodeData }) {
  const [expanded, setExpanded] = useState(true);
  const status = data.status ?? "idle";
  const hasRunOutput = status !== "idle";
  const preview =
    status === "error"
      ? data.runError ?? "Execution failed."
      : data.runOutput ?? data.output ?? "No output captured.";

  return (
    <footer className="workflow-card-footer">
      <button
        type="button"
        className="nodrag nopan nowheel flex w-full items-center justify-between text-left text-[12px] font-medium text-[#374151]"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Execution output</span>
        <span className="text-[11px] text-[#6b7280]">{expanded ? "Hide" : "Show"}</span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {hasRunOutput ? (
            <div className="nodrag nopan nowheel mt-2 space-y-2 rounded-md border border-[#e1e6ef] bg-[#f9fafb] p-2">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={status} />
                {data.duration ? <span className="text-[11px] text-[#6b7280]">{data.duration}</span> : null}
              </div>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#4b5563]">
                {truncateOutput(preview, 400)}
              </pre>
            </div>
          ) : (
            <div className="mt-2 grid min-h-[74px] place-items-center rounded-md border border-dashed border-[#d9dee8] bg-[#f9fafb] p-3 text-center">
              <div>
                <div className="mx-auto grid size-8 place-items-center rounded-full bg-[#eef4ff] text-[11px] font-semibold text-[#2563eb]">OP</div>
                <p className="mt-2 text-[12px] text-[#6b7280]">Output appears after execution.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}

function Port({
  id,
  type,
  position,
  label,
  kind,
}: {
  id: string;
  type: "source" | "target";
  position: Position;
  label: string;
  kind: PortKind;
}) {
  return (
    <div className="relative flex items-center gap-2 rounded-md bg-[#f3f6fb] px-2 py-1 text-[12px] text-[#4b5563]">
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

function InlineField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const className =
    "nodrag nopan nowheel w-full rounded-md border border-[#d9dee8] bg-white px-2 py-1.5 text-[14px] text-[#111827] outline-none focus:border-[#2563eb]";

  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-[#4b5563]">{label}</span>
      {multiline ? (
        <textarea
          className={`${className} min-h-[64px] resize-y`}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={className}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
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
        className="nodrag nopan nowheel w-full rounded-md border border-[#2563eb] bg-white px-1.5 py-0.5 text-[14px] font-semibold text-[#111827] outline-none"
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
      className="nodrag nopan truncate text-left text-[14px] font-semibold text-[#111827] hover:text-[#1d4ed8]"
      title="Click to rename"
      onClick={() => setEditing(true)}
    >
      {title}
    </button>
  );
}

export default function WorkflowNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const { updateNodeData } = useWorkflowEditor();
  const isCrop = data.kind === "crop";
  const isGemini = data.kind === "gemini";
  const isRequest = data.kind === "request";
  const isResponse = data.kind === "response";
  const crop = useMemo(() => data.crop ?? { x: 0, y: 0, width: 100, height: 100 }, [data.crop]);
  const status = data.status ?? "idle";
  const meta = NODE_KIND_META[data.kind];

  const patch = useCallback(
    (next: Partial<FlowNodeData>) => {
      updateNodeData(id, next);
    },
    [id, updateNodeData],
  );

  const patchCrop = useCallback(
    (field: "x" | "y" | "width" | "height", raw: string) => {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return;
      patch({ crop: { ...crop, [field]: parsed } });
    },
    [crop, patch],
  );

  return (
    <div className={`workflow-card ${selected ? "workflow-card-selected" : ""} ${statusClass(status)}`}>
      <header className="workflow-card-header">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[#eef4ff] text-[11px] font-semibold text-[#1d4ed8]">{meta.icon}</div>
        <div className="min-w-0 flex-1">
          <EditableTitle nodeId={id} title={data.title} />
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
            {data.fixed ? <span className="text-[11px] text-[#6b7280]">Locked</span> : null}
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      <section className="workflow-card-body">
        {isRequest ? (
          <div className="space-y-2">
            <InlineField
              label="text_field"
              value={data.output ?? ""}
              multiline
              placeholder="Enter request text input..."
              onChange={(value) => patch({ output: value })}
            />
            <Port id="text_field" type="source" position={Position.Right} label="text_field" kind="text" />
            <Port id="image_field" type="source" position={Position.Right} label="image_field" kind="image" />
          </div>
        ) : null}

        {isCrop ? (
          <div className="space-y-2">
            <Port id="input-image" type="target" position={Position.Left} label="Input Image" kind="image" />
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="space-y-1">
                  <span className="text-[12px] font-medium text-[#4b5563]">{field}</span>
                  <input
                    className="nodrag nopan nowheel w-full rounded-md border border-[#d9dee8] bg-white px-2 py-1.5 text-[14px] outline-none focus:border-[#2563eb]"
                    type="number"
                    min={0}
                    max={100}
                    value={crop[field]}
                    onChange={(event) => patchCrop(field, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="rounded-md border border-[#e1e6ef] bg-[#f9fafb] p-2 text-[12px] text-[#6b7280]">
              Trigger.dev task with mandatory 30+ second wait.
            </div>
            <Port id="output-image" type="source" position={Position.Right} label="Output Image" kind="image" />
          </div>
        ) : null}

        {isGemini ? (
          <div className="space-y-2">
            <Port id="prompt" type="target" position={Position.Left} label="Prompt" kind="text" />
            <Port id="image" type="target" position={Position.Left} label="Image (Vision)" kind="image" />
            <InlineField
              label="System Prompt"
              value={data.systemPrompt ?? ""}
              multiline
              placeholder="System instructions..."
              onChange={(value) => patch({ systemPrompt: value })}
            />
            <InlineField
              label="Prompt reference"
              value={data.prompt ?? ""}
              placeholder="e.g. Request-Inputs.text_field"
              onChange={(value) => patch({ prompt: value })}
            />
            <div className="rounded-md bg-[#f3f6fb] p-2 text-[12px] text-[#6b7280]">Model: Gemini 3.1 Pro</div>
            <Port id="response" type="source" position={Position.Right} label="Response" kind="text" />
          </div>
        ) : null}

        {isResponse ? (
          <div className="space-y-2">
            <Port id="result" type="target" position={Position.Left} label="result" kind="text" />
            <InlineField
              label="Notes"
              value={data.output ?? ""}
              multiline
              placeholder="Optional response notes..."
              onChange={(value) => patch({ output: value })}
            />
          </div>
        ) : null}
      </section>

      <ExecutionOutputSection data={data} />
    </div>
  );
}
