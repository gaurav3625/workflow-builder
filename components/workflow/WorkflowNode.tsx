"use client";

import { useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useWorkflowEditor } from "./context";
import type { FlowNodeData, PortKind, RunStatus } from "./types";

function statusClass(status: RunStatus = "idle") {
  if (status === "running") return "node-running";
  if (status === "success") return "node-success";
  if (status === "error") return "node-error";
  return "node-idle";
}

function StatusBadge({ status = "idle" }: { status?: RunStatus }) {
  if (status === "running") {
    return (
      <div className="flex items-center gap-1 rounded bg-[#ece9ff] px-1.5 py-0.5 text-[10px] font-medium text-[#5947ca]">
        <span className="node-spinner" aria-hidden />
        Running
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="rounded bg-[#ecf8ef] px-1.5 py-0.5 text-[10px] font-medium text-[#257942]">
        ✓ Done
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded bg-[#fdecec] px-1.5 py-0.5 text-[10px] font-medium text-[#a83232]">
        ✗ Error
      </div>
    );
  }

  return (
    <div className="rounded bg-[#f5f5f2] px-1.5 py-0.5 text-[10px] font-medium text-[#77756f]">
      Idle
    </div>
  );
}

function truncateOutput(value: string, max = 120) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function ExecutionOutputSection({ data }: { data: FlowNodeData }) {
  const [expanded, setExpanded] = useState(true);
  const status = data.status ?? "idle";

  if (status === "idle") return null;

  const preview =
    status === "error"
      ? data.runError ?? "Execution failed."
      : data.runOutput ?? data.output ?? "No output captured.";

  return (
    <div className="mt-3 border-t border-[#edeae4] pt-2">
      <button
        type="button"
        className="nodrag nopan nowheel flex w-full items-center justify-between text-left text-[10px] font-medium text-[#55524b]"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Execution output</span>
        <span className="text-[#918f88]">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded ? (
        <div className="nodrag nopan nowheel mt-2 space-y-2 rounded border border-[#e6e4df] bg-[#fafaf8] p-2">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={status} />
            {data.duration ? <span className="text-[10px] text-[#77756f]">{data.duration}</span> : null}
          </div>
          <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[#55524b]">
            {truncateOutput(preview, 400)}
          </pre>
        </div>
      ) : null}
    </div>
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
    "nodrag nopan nowheel w-full rounded border border-[#e6e4df] bg-white px-2 py-1 text-[10px] text-[#333] outline-none focus:border-[#8f87ff]";

  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium text-[#333]">{label}</span>
      {multiline ? (
        <textarea
          className={`${className} min-h-[52px] resize-y`}
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
    if (!editing) setDraft(title);
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
        className="nodrag nopan nowheel w-full rounded border border-[#8f87ff] bg-white px-1.5 py-0.5 text-[12px] font-semibold text-[#232323] outline-none"
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
      className="nodrag nopan truncate text-left text-[12px] font-semibold text-[#232323] hover:text-[#5947ca]"
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
  const crop = data.crop ?? { x: 0, y: 0, width: 100, height: 100 };
  const status = data.status ?? "idle";

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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <EditableTitle nodeId={id} title={data.title} />
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[#918f88]">
            {data.fixed ? "locked" : data.kind}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

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
          <div className="grid grid-cols-2 gap-1">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <label key={field} className="space-y-0.5">
                <span className="text-[9px] uppercase text-[#918f88]">{field}</span>
                <input
                  className="nodrag nopan nowheel w-full rounded border border-[#e6e4df] bg-white px-1.5 py-1 text-[10px] outline-none focus:border-[#8f87ff]"
                  type="number"
                  min={0}
                  max={100}
                  value={crop[field]}
                  onChange={(event) => patchCrop(field, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="rounded border border-[#edeae4] bg-white p-2 text-[10px] text-[#77756f]">
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
          <div className="rounded bg-[#f5f5f2] p-2 text-[10px] text-[#77756f]">Model: Gemini 3.1 Pro</div>
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

      <ExecutionOutputSection data={data} />
    </div>
  );
}
