import { prisma } from "@/lib/prisma";

export default async function TestPage() {
  const workflows = await prisma.workflow.findMany();

  return (
    <pre>
      {JSON.stringify(workflows, null, 2)}
    </pre>
  );
}