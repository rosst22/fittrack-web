import Link from "next/link";
import { shiftDate, prettyDate } from "@/lib/day";

export default function DateNav({ basePath, date }: { basePath: string; date: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href={`${basePath}?date=${shiftDate(date, -1)}`}
        className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
      >
        ← Prev
      </Link>
      <span className="text-sm font-medium text-foreground">{prettyDate(date)}</span>
      <Link
        href={`${basePath}?date=${shiftDate(date, 1)}`}
        className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
      >
        Next →
      </Link>
    </div>
  );
}
