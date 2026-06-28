import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RunStatus } from "@prisma/client";

const RUN_STATUS_VALUES = new Set<RunStatus>(["pending", "running", "success", "failed", "partial"]);

function formatDate(value: Date) {
  return value.toLocaleString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(durationMs: number | null) {
  return durationMs === null ? "-" : `${(durationMs / 1000).toFixed(1)}s`;
}

function scopeLabel(scope: string) {
  if (scope === "full") return "Full Workflow";
  if (scope === "partial") return "Multi-select";
  return "Single Node";
}

function normalizeRunStatus(status: unknown): RunStatus {
  const normalized = String(status ?? "success").trim().toLowerCase();
  if (normalized === "failure" || normalized === "error") return "failed";
  return RUN_STATUS_VALUES.has(normalized as RunStatus) ? (normalized as RunStatus) : "success";
}

function parseRunDate(value: unknown, fallback: Date) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function inferNodeType(node: { id?: unknown; title?: unknown }) {
  const value = `${String(node.id ?? "")} ${String(node.title ?? "")}`.toLowerCase();
  if (value.includes("crop")) return "crop";
  if (value.includes("gemini")) return "gemini";
  if (value.includes("request")) return "request";
  if (value.includes("response")) return "response";
  return "other";
}

function parseDurationMs(duration: unknown) {
  if (typeof duration === "number" && Number.isFinite(duration)) return Math.round(duration);
  const parsed = Number.parseFloat(String(duration ?? ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : null;
}

async function ensureWorkflowAccess(workflowId: string, userId: string) {
  return prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    select: { id: true },
  });
}

async function fetchHistoryRuns(workflowId: string) {
  const runs = await prisma.run.findMany({
    where: { workflowId },
    orderBy: { startedAt: "desc" },
    include: { nodeRuns: { orderBy: { startedAt: "asc" } } },
  });

  return runs.map((run) => ({
    id: run.id,
    scope: scopeLabel(run.scope),
    status: run.status,
    startedAt: formatDate(run.startedAt),
    completedAt: run.finishedAt ? formatDate(run.finishedAt) : undefined,
    duration: formatDuration(run.durationMs),
    nodes: run.nodeRuns.map((nodeRun) => ({
      id: nodeRun.nodeId,
      title: nodeRun.label,
      status: nodeRun.status,
      duration: formatDuration(nodeRun.durationMs),
      output: typeof nodeRun.output === "string" ? nodeRun.output : JSON.stringify(nodeRun.output ?? {}),
    })),
  }));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workflowId } = await context.params;
  const workflow = await ensureWorkflowAccess(workflowId, userId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const runs = await fetchHistoryRuns(workflowId);
  return NextResponse.json({ runs });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workflowId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await prisma.workflow.updateMany({
    where: { id: workflowId, userId },
    data: { flowData: { nodes: body.nodes, edges: body.edges } },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workflowId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.nodes)) {
    return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
  }

  const workflow = await ensureWorkflowAccess(workflowId, userId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const scopeValue = String(body.scope ?? "").trim();
  const normalizedScopeMap: Record<string, "full" | "partial" | "single"> = {
    full: "full",
    "full workflow": "full",
    "full_workflow": "full",
    partial: "partial",
    "multi-select": "partial",
    selected: "partial",
    single: "single",
    "single node": "single",
  };
  const runScope = normalizedScopeMap[scopeValue.toLowerCase()];
  if (!runScope) {
    return NextResponse.json({ error: "Invalid run scope" }, { status: 400 });
  }

  const completedFallback = new Date();
  const startedAt = parseRunDate(body.startedAt, completedFallback);
  const completedAt = parseRunDate(body.completedAt, completedFallback);
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  const runStatus = normalizeRunStatus(body.status);

  const run = await prisma.run.create({
    data: {
      workflowId,
      scope: runScope,
      status: runStatus,
      startedAt,
      finishedAt: completedAt,
      durationMs,
      nodeRuns: {
        create: body.nodes.map((node: { id?: unknown; title?: unknown; status?: unknown; duration?: unknown; output?: unknown; inputs?: unknown }) => ({
          nodeId: String(node.id ?? ""),
          nodeType: inferNodeType(node),
          label: String(node.title ?? node.id ?? ""),
          status: normalizeRunStatus(node.status),
          inputs: node.inputs ?? null,
          output: node.output ?? null,
          startedAt,
          finishedAt: completedAt,
          durationMs: parseDurationMs(node.duration),
        })),
      },
    },
  });

  const runs = await fetchHistoryRuns(workflowId);
  return NextResponse.json({ success: true, runId: run.id, runs });
}
