"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  });

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

  await prisma.workflow.updateMany({
    where: {
      id,
      userId,
    },
    data: {
      name: name.slice(0, 80),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/workflow/${id}`);
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

  await prisma.workflow.deleteMany({
    where: {
      id,
      userId,
    },
  });

  revalidatePath("/dashboard");
}

