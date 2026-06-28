"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useWorkflowEditor } from "./context";
import type { FlowNodeData, PortKind, RunStatus } from "./types";

const NODE_KIND_META: Record<
  FlowNodeData["kind"],
  { label: string; shortLabel: string; accent: string; softBg: string; icon: string }
> = {
  request: { label: "Request", shortLabel: "Input", accent: "#2563eb", softBg: "#eff6ff", icon: "IN" },
  crop: { label: "Transform", shortLabel: "Crop", accent: "#7c3aed", softBg: "#f5f3ff", icon: "CR" },
  gemini: { label: "LLM", shortLabel: "Gemini", accent: "#6366f1", softBg: "#eef2ff", icon: "AI" },
  response: { label: "Response", shortLabel: "Output", accent: "#059669", softBg: "#ecfdf5", icon: "OUT" },
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
              <pre className="workflow-node-output-text">{truncateOutput(preview, 400)}</pre>
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

function Port({
  id,
  type,
  label,
  kind,
  side,
}: {
  id: string;
  type: "source" | "target";
  label: string;
  kind: PortKind;
  side: "left" | "right";
}) {
  const position = side === "left" ? Position.Left : Position.Right;

  return (
    <div className={`workflow-port workflow-port--${side}`}>
      {side === "left" ? (
        <>
          <Handle
            id={id}
            type={type}
            position={position}
            className={`workflow-handle workflow-handle--${kind}`}
          />
          <span className="workflow-port-label">{label}</span>
        </>
      ) : (
        <>
          <span className="workflow-port-label">{label}</span>
          <Handle
            id={id}
            type={type}
            position={position}
            className={`workflow-handle workflow-handle--${kind}`}
          />
        </>
      )}
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
  const className = "nodrag nopan nowheel workflow-node-field-input";

  return (
    <label className="workflow-node-field">
      <span className="workflow-node-field-label">{label}</span>
      {multiline ? (
        <textarea
          className={`${className} workflow-node-field-textarea`}
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
          <div className="space-y-3">
            <InlineField
              label="text_field"
              value={data.output ?? ""}
              multiline
              placeholder="Enter request text input..."
              onChange={(value) => patch({ output: value })}
            />
            <div className="workflow-node-port-list">
              <Port id="text_field" type="source" side="right" label="text_field" kind="text" />
              <Port id="image_field" type="source" side="right" label="image_field" kind="image" />
            </div>
          </div>
        ) : null}

        {isCrop ? (
          <div className="space-y-3">
            <Port id="input-image" type="target" side="left" label="Input Image" kind="image" />
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="workflow-node-field">
                  <span className="workflow-node-field-label">{field}</span>
                  <input
                    className="nodrag nopan nowheel workflow-node-field-input"
                    type="number"
                    min={0}
                    max={100}
                    value={crop[field]}
                    onChange={(event) => patchCrop(field, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="workflow-node-note">Trigger.dev task with mandatory 30+ second wait.</div>
            <Port id="output-image" type="source" side="right" label="Output Image" kind="image" />
          </div>
        ) : null}

        {isGemini ? (
          <div className="space-y-3">
            <div className="workflow-node-port-list">
              <Port id="prompt" type="target" side="left" label="Prompt" kind="text" />
              <Port id="image" type="target" side="left" label="Image" kind="image" />
            </div>
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
            <div className="workflow-node-note">Model: Gemini 3.1 Pro</div>
            <Port id="response" type="source" side="right" label="Response" kind="text" />
          </div>
        ) : null}

        {isResponse ? (
          <div className="space-y-3">
            <Port id="result" type="target" side="left" label="result" kind="text" />
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
