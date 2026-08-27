"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions";

const links = [
  { href: "/", label: "Home" },
  { href: "/meals", label: "Meals" },
  { href: "/workouts", label: "Workouts" },
  { href: "/intake", label: "Daily" },
  { href: "/week", label: "Week" },
  { href: "/trends", label: "Trends" },
  { href: "/sleep", label: "Sleep" },
  { href: "/goals", label: "Goals" },
  { href: "/whoop", label: "Whoop" },
  { href: "/profile", label: "Profile" },
];

export default function NavBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
        <Link href="/" className="shrink-0 text-sm font-bold text-foreground">
          FitTrack
        </Link>
        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive(l.href)
                  ? "bg-surface-2 font-medium text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <form action={signOut} className="shrink-0">
          <button className="text-sm text-muted hover:text-foreground">Sign out</button>
        </form>
      </div>
    </header>
  );
}
