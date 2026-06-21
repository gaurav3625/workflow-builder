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

  return <WorkflowCanvas workflowId={workflow.id} workflowName={workflow.name} />;
}
