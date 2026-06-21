import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  await prisma.workflow.updateMany({
    where: { id: workflowId, userId },
    data: { flowData: { nodes: body.nodes, edges: body.edges } },
  });

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

  // Normalize scope values from the client; accept friendly labels too.
  const scopeValue = String(body.scope ?? "").trim();
  const normalizedScopeMap: Record<string, "full" | "partial" | "single"> = {
    full: "full",
    "full workflow": "full",
    "full_workflow": "full",
    "Full Workflow": "full",
    partial: "partial",
    "multi-select": "partial",
    "Multi-select": "partial",
    selected: "partial",
    single: "single",
    "Single Node": "single",
  };

  const runScope = normalizedScopeMap[scopeValue] ?? normalizedScopeMap[scopeValue.toLowerCase()];
  if (!runScope) {
    return NextResponse.json({ error: "Invalid run scope" }, { status: 400 });
  }

  const run = await prisma.run.create({
    data: {
      workflowId,
      scope: runScope,
      status: body.status ?? "success",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      nodeRuns: {
        create: body.nodes.map((node: any) => ({
          nodeId: node.id ?? "",
          nodeType: node.id?.startsWith("crop") ? "crop" : node.id?.startsWith("gemini") ? "gemini" : "other",
          label: node.title ?? node.id ?? "",
          status: node.status ?? "success",
          inputs: node.inputs ?? null,
          output: node.output ?? null,
          durationMs: node.duration ? Math.round(parseFloat(String(node.duration)) * 1000) : null,
        })),
      },
    },
  });

  return NextResponse.json({ success: true, runId: run.id });
}
