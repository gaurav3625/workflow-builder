"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

  revalidatePath("/dashboard");
}