"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PackageCheck, ShieldCheck, ShoppingCart, Truck, Zap } from "lucide-react";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { QuantityPicker } from "@/components/ui/QuantityPicker";
import { Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { Badge, badgeTone } from "@/components/ui/Badge";
import { WishlistButton } from "@/components/product/WishlistButton";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useToast } from "@/context/ToastContext";
import { discountPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/components/auth/RequireAuth";

export function BuyBox({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { notify } = useToast();
  const { format } = useCurrency();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const { checkAuth } = useRequireAuth();

  const out = product.stock <= 0;
  const pct = product.oldPrice ? discountPct(product.oldPrice, product.price) : 0;
  const colorVariant = product.variants?.find((v) => v.type === "Cor");
  const sizeVariant = product.variants?.find((v) => v.type === "Tamanho");

  const chosenVariant = colorVariant ? selectedColor ?? colorVariant.options[0].name : undefined;

  const handleAdd = (buyNow = false) => {
    const handled = checkAuth(() => {
      if (out) return;
      addItem(product, qty, chosenVariant);
      notify("Adicionado ao carrinho 🛒");
      if (buyNow) router.push("/carrinho");
    });
    if (!handled) {
      // O modal de login foi aberto pelo checkAuth
    }
  };

  return (
    <div className="space-y-5">
      {/* Preço e disponibilidade */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {product.badges.map((b) => (
            <Badge key={b} tone={badgeTone[b]}>
              {b}
            </Badge>
          ))}
          {pct > 0 && <Badge tone="red">-{pct}%</Badge>}
        </div>

        <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight text-slate-900 sm:text-[1.75rem]">
          {product.name}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Rating value={product.rating} count={product.ratingCount} size="sm" showValue />
          <span className="text-sm text-slate-500">·</span>
          <span className="text-sm font-medium text-slate-600">
            {product.sold.toLocaleString("pt-MZ")} vendidos
          </span>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <Price price={product.price} oldPrice={product.oldPrice} size="lg" showDiscount />
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-sm">
          {out ? (
            <span className="font-semibold text-red-600">Esgotado</span>
          ) : (
            <>
              <span className="inline-flex size-2.5 rounded-full bg-emerald-500" aria-hidden />
              <span className="font-semibold text-emerald-700">Em stock</span>
              <span className="text-slate-500">· {product.stock} disponíveis</span>
            </>
          )}
        </p>
      </div>

      {/* Variantes */}
      {colorVariant && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Cor: <span className="font-normal text-slate-500">{selectedColor ?? colorVariant.options[0].name}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {colorVariant.options.map((o) => (
              <button
                key={o.name}
                onClick={() => setSelectedColor(o.name)}
                aria-label={`Cor ${o.name}`}
                aria-pressed={selectedColor === o.name || (!selectedColor && o === colorVariant.options[0])}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-xl border-2 px-3 text-sm font-medium transition",
                  (selectedColor === o.name || (!selectedColor && o === colorVariant.options[0]))
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                {o.hex && (
                  <span
                    className="size-4 rounded-full border border-black/10"
                    style={{ backgroundColor: o.hex }}
                    aria-hidden
                  />
                )}
                {o.name}
                {(selectedColor === o.name || (!selectedColor && o === colorVariant.options[0])) && (
                  <Check className="size-3.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {sizeVariant && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Tamanho</p>
          <div className="flex flex-wrap gap-2">
            {sizeVariant.options.map((o) => (
              <button
                key={o.name}
                onClick={() => setVariant(o.name)}
                aria-pressed={variant === o.name}
                className={cn(
                  "h-10 min-w-11 rounded-xl border-2 px-3 text-sm font-semibold transition",
                  variant === o.name
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantidade + ações */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <QuantityPicker size="lg" value={qty} onChange={setQty} max={Math.max(product.stock, 1)} className="sm:w-28" />
        <Button
          onClick={() => handleAdd(false)}
          disabled={out}
          size="lg"
          className="flex-1"
          aria-label={`Adicionar ${product.name} ao carrinho`}
        >
          <ShoppingCart className="size-4" />
          Adicionar ao carrinho
        </Button>
      </div>

      <Button
        onClick={() => handleAdd(true)}
        disabled={out}
        variant="dark"
        size="lg"
        fullWidth
        className="group"
      >
        <Zap className="size-4" />
        Comprar agora
      </Button>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-500">
          {format(product.price * qty)} · {qty} {qty === 1 ? "unidade" : "unidades"}
        </p>
        <WishlistButton product={product} label="Guardar" />
      </div>

      {/* Informação de entrega */}
      <div className="space-y-2.5 rounded-2xl bg-slate-50 p-4 text-sm">
        <p className="flex items-center gap-2.5 text-slate-700">
          <Truck className="size-4.5 shrink-0 text-primary-600" />
          <span>
            Entrega estimada em{" "}
            <strong>
              {product.deliveryDays[0]}–{product.deliveryDays[1]} dias úteis
            </strong>{" "}
            em todo Moçambique
            {product.freeShipping && (
              <span className="ml-1 font-bold text-emerald-600">· Envio grátis</span>
            )}
          </span>
        </p>
        <p className="flex items-center gap-2.5 text-slate-700">
          <ShieldCheck className="size-4.5 shrink-0 text-primary-600" />
          Garantia de 6 meses · Devolução em 7 dias
        </p>
        <p className="flex items-center gap-2.5 text-slate-700">
          <PackageCheck className="size-4.5 shrink-0 text-primary-600" />
          Pagamento na entrega ou por transferência
        </p>
      </div>
    </div>
  );
}
