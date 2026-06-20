"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
} from "reactflow";

const nodes = [
  {
    id: "1",
    position: { x: 250, y: 100 },
    data: { label: "Start" },
    type: "input",
  },
];

export default function WorkflowCanvas() {
  return (
    <div className="h-[80vh] border rounded">
      <ReactFlow
        nodes={nodes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}