"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/context/ToastContext";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/components/auth/RequireAuth";

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
  const { checkAuth } = useRequireAuth();
  const active = isFavorite(product.id);

  const handle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const handled = checkAuth(() => {
      toggle(product);
      notify(
        active ? "Removido dos favoritos" : "Adicionado aos favoritos ❤️",
        "info",
      );
    });
    if (!handled) {
      // O modal de login foi aberto pelo checkAuth
    }
  };

  return (
    <button
      onClick={handle}
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-full bg-white text-slate-400 shadow-card transition-all duration-200 hover:text-red-500 active:scale-90",
        size === "md" ? "size-9" : "size-8",
        active && "text-red-500",
        className,
      )}
    >
      <Heart className={size === "md" ? "size-[18px]" : "size-4"} fill={active ? "currentColor" : "none"} />
      {label && <span className="ml-1.5 hidden text-sm font-medium sm:inline">{label}</span>}
    </button>
  );
}
