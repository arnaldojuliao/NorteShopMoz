import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      aria-hidden
    >
      <Image
        src="/logo.png"
        alt=""
        fill
        sizes="128px"
        priority
        className="object-contain"
      />
    </span>
  );
}

export function Logo({
  compact,
  className,
  light,
}: {
  /** Versão compacta para ecrãs pequenos — apenas o monograma. */
  compact?: boolean;
  className?: string;
  light?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5", className)}
      aria-label="NorteShop — página inicial"
    >
      <LogoMark className="size-9" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display text-lg font-extrabold tracking-tight",
              light ? "text-white" : "text-navy-900 dark:text-white",
            )}
          >
            Norte<span className="text-primary-600">Shop</span>
          </span>
          <span
            className={cn(
              "mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em]",
              light ? "text-white/60" : "text-slate-400",
            )}
          >
            Compras fáceis · Moçambique
          </span>
        </span>
      )}
    </Link>
  );
}
