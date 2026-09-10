"use client";

import type { Role } from "@prisma/client";
import {
  Anchor,
  FileText,
  FlaskConical,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  Scale,
  Settings,
  Users,
  Vault,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { atLeast } from "@/lib/rbac-shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Labels = Record<
  | "overview"
  | "publications"
  | "custody"
  | "coverage"
  | "history"
  | "simulator"
  | "customers"
  | "members"
  | "apiKeys"
  | "settings"
  | "publicPage",
  string
>;

export function OrgNav({
  slug,
  role,
  roleLabel,
  labels,
}: {
  slug: string;
  role: Role;
  roleLabel: string;
  labels: Labels;
}) {
  const pathname = usePathname();
  const base = `/app/${slug}`;
  const items: Array<{ href: string; label: string; icon: typeof Anchor; min: Role; exact?: boolean; tour: string }> = [
    { href: base, label: labels.overview, icon: LayoutDashboard, min: "VIEWER", exact: true, tour: "overview" },
    { href: `${base}/publications`, label: labels.publications, icon: FileText, min: "VIEWER", tour: "publications" },
    { href: `${base}/custody`, label: labels.custody, icon: Vault, min: "VIEWER", tour: "custody" },
    { href: `${base}/coverage`, label: labels.coverage, icon: Scale, min: "VIEWER", tour: "coverage" },
    { href: `${base}/history`, label: labels.history, icon: History, min: "VIEWER", tour: "history" },
    { href: `${base}/simulator`, label: labels.simulator, icon: FlaskConical, min: "VIEWER", tour: "simulator" },
    { href: `${base}/customers`, label: labels.customers, icon: Users, min: "OPERATOR", tour: "customers" },
    { href: `${base}/members`, label: labels.members, icon: Users, min: "ADMIN", tour: "members" },
    { href: `${base}/api-keys`, label: labels.apiKeys, icon: KeyRound, min: "ADMIN", tour: "api-keys" },
    { href: `${base}/settings`, label: labels.settings, icon: Settings, min: "ADMIN", tour: "settings" },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items
        .filter((i) => atLeast(role, i.min))
        .map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              data-tour={i.tour}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground",
                active && "bg-accent font-medium text-foreground"
              )}
            >
              <i.icon className="size-4" aria-hidden />
              {i.label}
            </Link>
          );
        })}
      <Link
        href={`/p/${slug}`}
        className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Globe className="size-4" aria-hidden />
        {labels.publicPage}
      </Link>
      <div className="mt-4 px-3">
        <Badge variant="outline">{roleLabel}</Badge>
      </div>
    </nav>
  );
}
