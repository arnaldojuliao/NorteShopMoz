"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import { useLocalStorageState } from "@/lib/hooks";
import { repo } from "@/lib/repo";
import type { Product, UserProfile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductGridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function FavoritesPage() {
  const { ids } = useFavorites();
  const { user: authUser } = useAuth();
  const [profile] = useLocalStorageState<UserProfile | null>("nsm:profile", null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const idsKey = ids.join(",");

  useEffect(() => {
    let alive = true;
    repo
      .getProducts()
      .then((all) => {
        if (alive) setProducts(all.filter((p) => ids.includes(p.id)));
      })
      .catch(() => {
        if (alive) setProducts([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const count = products?.length ?? 0;

  const displayName = authUser?.fullName || profile?.fullName || "";

  return (
    <RequireAuth redirect fallbackPath="/">
      <div className="container-nsm py-6">
      <div className="flex items-center gap-3.5">
        {displayName && (
          <Avatar
            src={authUser?.avatar ?? profile?.avatar}
            name={displayName}
            className="size-12 ring-4 ring-white shadow-card sm:size-14"
            textClassName="text-lg sm:text-xl"
          />
        )}
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Os meus favoritos
          </h1>
          {products !== null && (
            <p className="mt-1 text-sm text-slate-500">
              {count} {count === 1 ? "produto guardado" : "produtos guardados"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        {products === null ? (
          <ProductGridSkeleton count={4} />
        ) : count === 0 ? (
          <EmptyState
            icon={Heart}
            title="Sem favoritos ainda"
            description="Toque no coração de um produto para o guardar aqui e encontrá-lo rapidamente."
            actionLabel="Descobrir produtos"
            actionHref="/"
          />
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
          </div>
        </RequireAuth>
        );
      }
