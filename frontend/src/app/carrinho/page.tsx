"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Trash2, Truck, Lock } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/Button";
import { QuantityPicker } from "@/components/ui/QuantityPicker";
import { ProductImage } from "@/components/product/ProductImage";
import { discountPct } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { useAsyncData } from "@/lib/hooks";
import { getShippingConfig, LOCAL_FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function CartPage() {
  const { format } = useCurrency();
  const { items, subtotal, updateQty, removeItem, clear } = useCart();
  const { user } = useAuth();
  const { checkAuth } = useRequireAuth();
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  // Limite de entrega grátis do servidor (fallback local enquanto não carrega).
  const { data: shipping } = useAsyncData(getShippingConfig, []);
  const FREE_SHIPPING_THRESHOLD = shipping?.freeShippingThreshold ?? LOCAL_FREE_SHIPPING_THRESHOLD;
  // Estimativa de envio: taxa da província predefinida (a primeira do checkout).
  const defaultFee = shipping?.provinces[0]?.fee ?? 150;

  const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : defaultFee;
  const savings = items.reduce((acc, i) => acc + (i.oldPrice && i.oldPrice > i.price ? (i.oldPrice - i.price) * i.qty : 0), 0);

  const isLoggedIn = Boolean(user);

  const handleRemove = (productId: string, variant?: string) => {
    setRemoving(productId + (variant ?? ""));
    window.setTimeout(() => {
      removeItem(productId, variant);
      setRemoving(null);
    }, 200);
  };

  const handleCheckout = () => {
    checkAuth(() => {
      // Se autenticado, navega para checkout
      router.push("/checkout");
    });
  };

  return (
    <div className="container-nsm py-6">
      <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
        Carrinho de compras
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {items.length} {items.length === 1 ? "produto" : "produtos"} no carrinho
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Itens */}
        <div className="space-y-3">
          {items.map((item) => {
            const pct = item.oldPrice ? discountPct(item.oldPrice, item.price) : 0;
            const removingKey = item.productId + (item.variant ?? "");
            return (
              <div
                key={removingKey}
                className={cn(
                  "flex gap-4 rounded-2xl border border-slate-100 bg-white p-3.5 transition-all duration-300 sm:p-4",
                  removing === removingKey && "scale-[0.98] opacity-40",
                )}
              >
                <Link
                  href={`/produto/${item.slug}`}
                  className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:size-28"
                >
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="112px"
                    label={item.name}
                    imgClassName="object-cover"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/produto/${item.slug}`}
                        className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-primary-700 sm:text-[15px]"
                      >
                        {item.name}
                      </Link>
                      {item.variant && (
                        <p className="mt-0.5 text-xs text-slate-400">Variante: {item.variant}</p>
                      )}
                      {pct > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-red-600">
                          Poupa {format((item.oldPrice! - item.price) * item.qty)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(item.productId, item.variant)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remover ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

<div className="mt-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pt-2">
                      <QuantityPicker
                        size="md"
                        value={item.qty}
                        onChange={(q) => updateQty(item.productId, q, item.variant)}
                      />
                      <div className="text-right sm:text-right w-full sm:w-auto">
                        <p className="font-display text-base font-bold text-slate-900 tabular-nums">
                          {format(item.price * item.qty)}
                        </p>
                        {item.oldPrice && (
                          <p className="text-xs text-slate-400 line-through">
                            {format(item.oldPrice * item.qty)}
                          </p>
                        )}
                      </div>
                    </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={clear}
            className="text-sm font-medium text-slate-400 underline-offset-2 transition hover:text-red-600 hover:underline"
          >
            Esvaziar carrinho
          </button>
        </div>

        {/* Resumo */}
        <aside className="h-fit rounded-2xl border border-slate-100 bg-white p-5 lg:sticky lg:top-32">
          <h2 className="font-display text-lg font-bold text-slate-900">Resumo do pedido</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-semibold text-slate-800 tabular-nums">{format(subtotal)}</dd>
            </div>
            {savings > 0 && (
              <div className="flex justify-between text-emerald-600">
                <dt>Desconto</dt>
                <dd className="font-semibold">-{format(savings)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="flex items-center gap-1.5 text-slate-500">
                <Truck className="size-4 text-primary-500" /> Entrega
              </dt>
              <dd className={cn("font-semibold", shippingCost === 0 ? "text-emerald-600" : "text-slate-800")}>
                {shippingCost === 0 ? "Grátis" : format(shippingCost)}
              </dd>
            </div>
            {shippingCost > 0 && (
              <p className="text-xs text-slate-400">
                Entrega grátis em compras acima de {format(FREE_SHIPPING_THRESHOLD)}.
              </p>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-3">
              <dt className="font-bold text-slate-900">TOTAL</dt>
              <dd className="font-display text-xl font-extrabold text-slate-900 tabular-nums">
                {format(Math.max(0, subtotal - savings) + shippingCost)}
              </dd>
            </div>
          </dl>

          <Button 
            onClick={handleCheckout}
            size="lg" 
            fullWidth 
            className="mt-5"
            variant={isLoggedIn ? "primary" : "outline"}
          >
            {isLoggedIn ? (
              <>Finalizar compra <ArrowRight className="size-4" /></>
            ) : (
              <>Entrar para finalizar <Lock className="size-4" /></>
            )}
          </Button>
          {isLoggedIn ? (
            <p className="mt-3 text-center text-xs text-slate-400">
              Pagamento na entrega disponível em todo Moçambique
            </p>
          ) : (
            <p className="mt-3 text-center text-xs text-slate-500">
              Faça login para prosseguir com a compra
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
