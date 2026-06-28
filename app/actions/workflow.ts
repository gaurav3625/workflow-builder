"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isDatabaseConnectionError } from "@/lib/prisma-errors";
import { revalidatePath } from "next/cache";

export async function createWorkflow() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const workflow = await prisma.workflow.create({
    data: {
      name: "Untitled Workflow",
      userId,
      status: "draft",
      flowData: {},
    },
  }).catch((error: unknown) => {
    if (!isDatabaseConnectionError(error)) throw error;
    console.error("[workflow-action] createWorkflow failed because the database is unavailable", error);
    return null;
  });

  if (!workflow) return;

  revalidatePath("/dashboard");
}
