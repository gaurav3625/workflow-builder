"use client";

import { createContext, useContext } from "react";
import type { FlowNodeData } from "./types";

type WorkflowEditorContextValue = {
  updateNodeData: (nodeId: string, patch: Partial<FlowNodeData>) => void;
};

export const WorkflowEditorContext = createContext<WorkflowEditorContextValue | null>(null);

export function useWorkflowEditor() {
  const context = useContext(WorkflowEditorContext);
  if (!context) {
    throw new Error("useWorkflowEditor must be used within WorkflowEditorContext");
  }
  return context;
}
