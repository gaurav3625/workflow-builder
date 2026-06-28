import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import type { FlowEdge, FlowNode } from "@/components/workflow/types";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default async function WorkflowPage({ params }: Props) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const { id } = await params;

  const workflow = await prisma.workflow.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!workflow) {
    notFound();
  }

  const flowData = workflow.flowData;
  const flowRecord =
    flowData && typeof flowData === "object" && !Array.isArray(flowData)
      ? (flowData as Record<string, unknown>)
      : null;
  const initialFlow =
    flowRecord && Array.isArray(flowRecord.nodes) && Array.isArray(flowRecord.edges)
      ? {
          nodes: flowRecord.nodes as FlowNode[],
          edges: flowRecord.edges as FlowEdge[],
        }
      : null;

  const runs = await prisma.run.findMany({
    where: { workflowId: id },
    orderBy: { startedAt: "desc" },
    include: { nodeRuns: true },
  });

  const initialHistoryRuns = runs.map((run) => ({
    id: run.id,
    scope: (
      run.scope === "full"
        ? "Full Workflow"
        : run.scope === "partial"
        ? "Multi-select"
        : "Single Node"
    ) as "Full Workflow" | "Multi-select" | "Single Node",
    status: run.status,
    startedAt: run.startedAt.toLocaleString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    completedAt: run.finishedAt
      ? run.finishedAt.toLocaleString("en", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : undefined,
    duration: run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "-",
    nodes: run.nodeRuns.map((nodeRun) => ({
      id: nodeRun.nodeId,
      title: nodeRun.label,
      status: nodeRun.status,
      duration: nodeRun.durationMs ? `${(nodeRun.durationMs / 1000).toFixed(1)}s` : "-",
      output: typeof nodeRun.output === "string" ? nodeRun.output : JSON.stringify(nodeRun.output ?? {}),
    })),
  }));

  return (
    <WorkflowCanvas
      workflowId={workflow.id}
      workflowName={workflow.name}
      initialFlow={initialFlow}
      initialHistoryRuns={initialHistoryRuns}
    />
  );
}
