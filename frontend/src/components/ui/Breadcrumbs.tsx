import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const crumbs = [{ label: "Início", href: "/" }, ...items];
  return (
    <nav aria-label="Migalhas de pão" className="flex flex-wrap items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-slate-300" aria-hidden />}
            {c.href && !last ? (
              <Link
                href={c.href}
                className="flex items-center gap-1 text-slate-500 transition hover:text-primary-700"
              >
                {i === 0 && <Home className="size-3.5" aria-hidden />}
                {c.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-slate-800" : "text-slate-500"} aria-current={last ? "page" : undefined}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
