import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { databaseUnavailableMessage, isDatabaseConnectionError } from "@/lib/prisma-errors";

function formatStartedAt(value: Date) {
  const elapsedMs = Date.now() - value.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / 60000);

  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  return value.toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function runDurationMs(startedAt: Date, finishedAt: Date | null, storedDurationMs: number | null) {
  if (storedDurationMs !== null) return storedDurationMs;
  if (!finishedAt) return null;
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function nodeOutput(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value ?? {});
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get("workflowId")?.trim();

  if (!workflowId) {
    return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
  }

  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, userId },
      select: { id: true },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const runs = await prisma.run.findMany({
      where: { workflowId },
      orderBy: { startedAt: "desc" },
      include: { nodeRuns: { orderBy: { startedAt: "asc" } } },
    });

    return NextResponse.json({
      runs: runs.map((run) => {
        const durationMs = runDurationMs(run.startedAt, run.finishedAt, run.durationMs);

        return {
          id: run.id,
          scope: run.scope,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          startedAtLabel: formatStartedAt(run.startedAt),
          completedAt: run.finishedAt?.toISOString() ?? null,
          durationMs,
          nodeCount: run.nodeRuns.length,
          nodes: run.nodeRuns.map((nodeRun) => ({
            id: nodeRun.nodeId,
            title: nodeRun.label,
            type: nodeRun.nodeType,
            status: nodeRun.status,
            startedAt: nodeRun.startedAt?.toISOString() ?? null,
            completedAt: nodeRun.finishedAt?.toISOString() ?? null,
            durationMs: runDurationMs(nodeRun.startedAt ?? run.startedAt, nodeRun.finishedAt, nodeRun.durationMs),
            output: nodeOutput(nodeRun.output),
            error: nodeRun.error,
          })),
        };
      }),
    });
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
    console.error("[runs] Unable to fetch run history", error);
    return NextResponse.json({ error: databaseUnavailableMessage(), runs: [] }, { status: 503 });
  }
}
