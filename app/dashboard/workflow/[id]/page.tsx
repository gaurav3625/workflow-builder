import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import { databaseUnavailableMessage, isDatabaseConnectionError } from "@/lib/prisma-errors";
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

  const { workflow, databaseError } = await prisma.workflow.findFirst({
    where: {
      id,
      userId,
    },
  })
    .then((item) => ({ workflow: item, databaseError: false }))
    .catch((error: unknown) => {
      if (!isDatabaseConnectionError(error)) throw error;
      console.error("[workflow] Unable to load workflow", error);
      return { workflow: null, databaseError: true };
    });

  if (databaseError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-6 text-[#171717]">
        <div className="max-w-md rounded-md border border-[#f0c5c5] bg-white p-5 text-sm shadow-sm">
          <h1 className="text-base font-semibold text-[#8f2424]">Unable to load workflow</h1>
          <p className="mt-2 text-[#6d6b65]">{databaseUnavailableMessage()}</p>
        </div>
      </main>
    );
  }

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

  return <WorkflowCanvas workflowId={workflow.id} workflowName={workflow.name} initialFlow={initialFlow} />;
}
