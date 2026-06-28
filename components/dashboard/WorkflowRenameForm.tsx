"use client";

import { useFormStatus } from "react-dom";
import { renameWorkflow } from "@/lib/actions/workflow";

function RenameButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md border border-[#d9d9d4] px-2 py-1.5 text-xs font-medium hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {pending ? "Saving..." : "Rename"}
    </button>
  );
}

export default function WorkflowRenameForm({ id, name }: { id: string; name: string }) {
  return (
    <form action={renameWorkflow} className="flex min-w-[220px] flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        aria-label={`Rename ${name}`}
        className="min-w-0 flex-1 rounded-md border border-[#d9d9d4] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
        name="name"
        defaultValue={name}
        required
      />
      <RenameButton />
    </form>
  );
}
