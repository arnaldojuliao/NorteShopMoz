import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  subtitle,
  linkLabel,
  linkHref,
  className,
}: {
  title: string;
  subtitle?: string;
  linkLabel?: string;
  linkHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-end justify-between gap-4", className)}>
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {linkLabel && linkHref && (
        <Link
          href={linkHref}
          className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-700 transition hover:text-primary-800 sm:inline-flex"
        >
          {linkLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
