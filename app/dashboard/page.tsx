import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createWorkflow } from "@/lib/actions/workflow";
import Link from "next/link";

export default async function DashboardPage() {
  const { userId } = await auth();

  const workflows = await prisma.workflow.findMany({
    where: {
      userId: userId!,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">
          Workflows
        </h1>

        <UserButton />
      </div>

      <form action={createWorkflow}>
        <button
          type="submit"
          className="px-4 py-2 border rounded"
        >
          Create Workflow
        </button>
      </form>

      <div className="mt-8 space-y-4">
        {workflows.map((workflow) => (
          <Link
            key={workflow.id}
            href={`/dashboard/workflow/${workflow.id}`}
            className="block border rounded p-4"
            >
            <h2>{workflow.name}</h2>
            <p>{workflow.status}</p>
            </Link>
        ))}
      </div>
    </main>
  );
}