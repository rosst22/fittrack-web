"use client";

import { useFormStatus } from "react-dom";

export default function WhoopSyncButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent-2 px-4 py-2 text-sm font-semibold text-white shadow-sm transition duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Syncing…" : "Sync now"}
    </button>
  );
}
