"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isDatabaseConnectionError } from "@/lib/prisma-errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function handleDatabaseActionError(action: string, error: unknown) {
  if (!isDatabaseConnectionError(error)) throw error;
  console.error(`[workflow-action] ${action} failed because the database is unavailable`, error);
}

export async function createWorkflow() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const workflow = await prisma.workflow.create({
    data: {
      name: "Untitled Workflow",
      userId,
      status: "draft",
      flowData: {},
    },
  }).catch((error: unknown) => {
    handleDatabaseActionError("createWorkflow", error);
    return null;
  });

  if (!workflow) return;

  revalidatePath("/dashboard");
  redirect(`/dashboard/workflow/${workflow.id}`);
}

export async function renameWorkflow(formData: FormData) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id || !name) {
    return;
  }
  try {
    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow || workflow.userId !== userId) {
      // nothing to do if the workflow doesn't exist or doesn't belong to the user
      return;
    }

    await prisma.workflow.update({ where: { id }, data: { name: name.slice(0, 80) } });
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/workflow/${id}`);
  } catch (error: unknown) {
    handleDatabaseActionError("renameWorkflow", error);
    return;
  }
}

export async function deleteWorkflow(formData: FormData) {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const id = String(formData.get("id") ?? "");

  if (!id) {
    return;
  }

  const result = await prisma.workflow.deleteMany({
    where: {
      id,
      userId,
    },
  }).catch((error: unknown) => {
    handleDatabaseActionError("deleteWorkflow", error);
    return null;
  });

  if (!result) return;

  revalidatePath("/dashboard");
}
