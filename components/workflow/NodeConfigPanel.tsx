"use client";

import type { FlowNode, FlowNodeData } from "./types";

type NodeConfigPanelProps = {
  node: FlowNode | null;
  onUpdate: (nodeId: string, patch: Partial<FlowNodeData>) => void;
};

function Field({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: "text" | "number";
}) {
  const inputClass =
    "w-full rounded-md border border-[#d9d8d2] bg-white px-3 py-2 text-sm text-[#333] outline-none focus:border-[#8f87ff]";

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#55524b]">{label}</span>
      {multiline ? (
        <textarea className={`${inputClass} min-h-[88px] resize-y`} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function ImageField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Store the image inline as a base64 data URL so downstream nodes can
      // consume it the same way text_field content (data.output) flows.
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="block space-y-1.5">
      <span className="text-xs font-medium text-[#55524b]">Image field</span>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Selected image_field preview"
            className="size-16 shrink-0 rounded-md border border-[#e6e4df] object-cover"
          />
          <button
            type="button"
            className="rounded-md border border-[#f0c5c5] px-2.5 py-1.5 text-xs font-medium text-[#a83232] hover:bg-[#fff6f6]"
            onClick={() => onChange(undefined)}
          >
            Remove
          </button>
        </div>
      ) : null}
      <input
        className="block w-full text-xs text-[#55524b] file:mr-3 file:rounded-md file:border file:border-[#d9d8d2] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#333] hover:file:border-[#8f87ff]"
        type="file"
        accept="image/*"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          // Allow re-selecting the same file after a remove.
          event.target.value = "";
        }}
      />
    </div>
  );
}

export default function NodeConfigPanel({ node, onUpdate }: NodeConfigPanelProps) {
  if (!node) {
    return (
      <div className="mb-4 rounded-md border border-dashed border-[#d9d8d2] bg-[#fbfbf9] p-4 text-sm text-[#77756f]">
        Select a node to edit its configuration.
      </div>
    );
  }

  const { id, data } = node;
  const patch = (next: Partial<FlowNodeData>) => onUpdate(id, next);
  const crop = data.crop ?? { x: 0, y: 0, width: 100, height: 100 };

  return (
    <div className="mb-4 max-h-[42vh] overflow-y-auto rounded-md border border-[#e6e4df] bg-[#fbfbf9] p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Node Config</h2>
        <p className="text-xs text-[#77756f]">{data.kind} node</p>
      </div>

      <div className="space-y-3">
        <Field label="Name" value={data.title} onChange={(value) => patch({ title: value.trim() || data.title })} />

        {data.kind === "request" ? (
          <>
            <Field
              label="Text field content"
              value={data.output ?? ""}
              multiline
              onChange={(value) => patch({ output: value })}
            />
            <ImageField
              value={data.imageData}
              onChange={(imageData) => patch({ imageData })}
            />
          </>
        ) : null}

        {data.kind === "crop" ? (
          <div className="grid grid-cols-2 gap-2">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <Field
                key={field}
                label={`Crop ${field.toUpperCase()} (%)`}
                type="number"
                value={crop[field]}
                onChange={(value) => {
                  const parsed = Number(value);
                  if (Number.isNaN(parsed)) return;
                  patch({ crop: { ...crop, [field]: parsed } });
                }}
              />
            ))}
          </div>
        ) : null}

        {data.kind === "gemini" ? (
          <>
            <Field
              label="System prompt"
              value={data.systemPrompt ?? ""}
              multiline
              onChange={(value) => patch({ systemPrompt: value })}
            />
            <Field label="Prompt reference" value={data.prompt ?? ""} onChange={(value) => patch({ prompt: value })} />
          </>
        ) : null}

        {data.kind === "response" ? (
          <Field label="Notes" value={data.output ?? ""} multiline onChange={(value) => patch({ output: value })} />
        ) : null}

        {data.status && data.status !== "idle" ? (
          <div className="rounded-md border border-[#e6e4df] bg-white p-3 text-xs">
            <div className="mb-1 font-medium text-[#333]">Last execution</div>
            <div className="text-[#77756f]">
              Status: {data.status}
              {data.duration ? ` · ${data.duration}` : ""}
            </div>
            {data.status === "error" && data.runError ? (
              <p className="mt-2 text-[#a83232]">{data.runError}</p>
            ) : null}
            {data.status === "success" && data.runOutput ? (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[#55524b]">
                {data.runOutput}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
