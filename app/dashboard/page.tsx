import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createWorkflow, deleteWorkflow } from "@/lib/actions/workflow";
import WorkflowRenameForm from "@/components/dashboard/WorkflowRenameForm";
import { databaseUnavailableMessage, isDatabaseConnectionError } from "@/lib/prisma-errors";
import Link from "next/link";

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function DashboardPage() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const { workflows, databaseError } = await prisma.workflow.findMany({
    where: {
      userId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })
    .then((items) => ({ workflows: items, databaseError: null as string | null }))
    .catch((error: unknown) => {
      if (!isDatabaseConnectionError(error)) throw error;
      console.error("[dashboard] Unable to load workflows", error);
      return { workflows: [], databaseError: databaseUnavailableMessage() };
    });

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#171717]">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[#e2e2de] bg-white px-4 py-5 md:block">
          <div className="mb-8 flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-[#191919] text-sm font-semibold text-white">
              N
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">NextFlow</p>
              <p className="text-xs text-[#77756f]">Workflow builder</p>
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link className="block rounded-md bg-[#f0f0ed] px-3 py-2 font-medium" href="/dashboard">
              Workflows
            </Link>
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-[#e2e2de] bg-white px-5 py-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
              <p className="text-sm text-[#77756f]">Create, open, rename, and delete your saved flows.</p>
            </div>
            <div className="flex items-center gap-3">
              <form action={createWorkflow}>
                <button
                  type="submit"
                  className="rounded-md bg-[#191919] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#343434]"
                >
                  Create New Workflow
                </button>
              </form>
              <UserButton />
            </div>
          </header>

          <div className="p-5">
            {databaseError ? (
              <div className="mb-4 rounded-md border border-[#f0c5c5] bg-[#fff6f6] p-4 text-sm text-[#8f2424]">
                <p className="font-medium">Unable to load workflows</p>
                <p className="mt-1">{databaseError}</p>
              </div>
            ) : null}
            {!databaseError && workflows.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-md border border-dashed border-[#d6d6d0] bg-white">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-semibold">No workflows yet</h2>
                  <p className="mt-2 text-sm text-[#77756f]">Create your first workflow to open the canvas with Request-Inputs and Response already placed.</p>
                  <form action={createWorkflow} className="mt-5">
                    <button className="rounded-md bg-[#191919] px-3 py-2 text-sm font-medium text-white" type="submit">
                      Create Workflow
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[#e2e2de] bg-white">
                <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(260px,1fr)_130px_150px_180px] gap-4 border-b border-[#ededeb] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#77756f]">
                  <span>Name</span>
                  <span>Status</span>
                  <span>Last edited</span>
                  <span>Actions</span>
                </div>
                {workflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="grid grid-cols-[minmax(260px,1fr)_130px_150px_180px] items-center gap-4 border-b border-[#f0f0ed] px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 space-y-1">
                      <WorkflowRenameForm id={workflow.id} name={workflow.name} />
                      <Link href={`/dashboard/workflow/${workflow.id}`} className="block truncate text-xs text-[#77756f] hover:text-[#111827]">
                        {workflow.id}
                      </Link>
                    </div>
                    <span className="w-fit rounded-full bg-[#ecf8ef] px-2 py-1 text-xs font-medium text-[#257942]">
                      {workflow.status}
                    </span>
                    <span className="text-sm text-[#77756f]">{formatUpdatedAt(workflow.updatedAt)}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/workflow/${workflow.id}`}
                        className="rounded-md border border-[#d9d9d4] px-2.5 py-1.5 text-xs font-medium hover:bg-[#f7f7f5]"
                      >
                        Open
                      </Link>
                      <form action={deleteWorkflow} className="flex-shrink-0">
                        <input type="hidden" name="id" value={workflow.id} />
                        <button className="rounded-md border border-[#f0c5c5] px-2 py-1.5 text-xs font-medium text-[#a83232] hover:bg-[#fff6f6]" type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}


