"use client";

import { createContext, useContext } from "react";
import type { FlowNodeData } from "./types";

type WorkflowEditorContextValue = {
  updateNodeData: (nodeId: string, patch: Partial<FlowNodeData>) => void;
  /**
   * Image (base64 data URL) currently arriving at a node's image-input handle
   * from an upstream connection, keyed by nodeId then targetHandle id. Computed
   * by the canvas from the live nodes/edges so nodes can show what they receive.
   */
  incomingImages: Record<string, Record<string, string>>;
};

export const WorkflowEditorContext = createContext<WorkflowEditorContextValue | null>(null);

export function useWorkflowEditor() {
  const context = useContext(WorkflowEditorContext);
  if (!context) {
    throw new Error("useWorkflowEditor must be used within WorkflowEditorContext");
  }
  return context;
}
