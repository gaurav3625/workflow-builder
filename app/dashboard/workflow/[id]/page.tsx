import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import WorkflowCanvas from "@/components/WorkflowCanvas";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default async function WorkflowPage({
  params,
}: Props) {
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: {
      id,
    },
  });

  if (!workflow) {
    notFound();
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">
        {workflow.name}
      </h1>

      <p className="mt-2">
        Status: {workflow.status}
      </p>

      <div className="mt-6">
            <WorkflowCanvas />
      </div>
    </main>
  );
}