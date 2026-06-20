"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function createWorkflow() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  await prisma.workflow.create({
    data: {
      name: "Untitled Workflow",
      userId,
      status: "draft",
      flowData: {},
    },
  });
}