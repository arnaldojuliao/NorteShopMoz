"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/context/ToastContext";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export function WishlistButton({
  product,
  size = "md",
  className,
  label,
}: {
  product: Product;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  const { isFavorite, toggle } = useFavorites();
  const { notify } = useToast();
  const active = isFavorite(product.id);

  // Favoritos de convidado existem (`localStorage`, com merge no login) — não
  // se abre o modal de login por marcar um coração.
  const handle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(product);
    notify(
      active ? "Removido dos favoritos" : "Adicionado aos favoritos ❤️",
      "info",
    );
  };

  return (
    <button
      onClick={handle}
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-full bg-surface text-slate-400 shadow-card transition-all duration-200 hover:text-pink active:scale-90",
        // Com rótulo o botão deixa de ser um círculo: `size-10` fixo cortava o
        // texto («Guardar») e empurrava-o para fora do botão.
        label
          ? "h-10 gap-1.5 px-3.5"
          : size === "md"
            ? "size-10"
            : "size-9",
        active && "text-pink",
        className,
      )}
    >
      <Heart
        className={cn("shrink-0", size === "md" ? "size-5" : "size-[18px]")}
        fill={active ? "currentColor" : "none"}
      />
      {label && (
        <span className="whitespace-nowrap text-sm font-medium">{label}</span>
      )}
    </button>
  );
}
