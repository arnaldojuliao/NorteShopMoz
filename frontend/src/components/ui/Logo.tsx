import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      aria-hidden
    >
      {/* Fonte de 512px (e não o master de 1254px/1,3 MB): o `next/image`
          redimensiona para o tamanho real e o ficheiro é servido diretamente a
          motores de busca pelo JSON-LD/Og. */}
      <Image
        src="/logo-512.png"
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
      aria-label="NorteShopMoz — página inicial"
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
            Norte
            {/* Sobre fundos escuros (rodapé navy) o `primary-600` dava 2,8:1;
                `primary-300` dá 9,3:1. */}
            <span className={light ? "text-primary-300" : "text-primary-600"}>Shop</span>
            Moz
          </span>
          <span
            className={cn(
              "mt-0.5 text-xs font-medium uppercase tracking-[0.18em]",
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
