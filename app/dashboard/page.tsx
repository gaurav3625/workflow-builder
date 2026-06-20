import { UserButton } from "@clerk/nextjs";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">
          Workflows
        </h1>

        <UserButton />
      </div>

      <button className="px-4 py-2 border rounded">
        Create Workflow
      </button>

      <div className="mt-8 border rounded p-4">
        <h2>My First Workflow</h2>
        <p>Draft</p>
      </div>
    </main>
  );
}