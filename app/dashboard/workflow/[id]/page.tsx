import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import WorkflowCanvas from "@/components/WorkflowCanvas";

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
  const initialFlow =
    flowData && typeof flowData === "object" && !Array.isArray(flowData) &&
    Array.isArray((flowData as any).nodes) &&
    Array.isArray((flowData as any).edges)
      ? {
          nodes: (flowData as any).nodes,
          edges: (flowData as any).edges,
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
