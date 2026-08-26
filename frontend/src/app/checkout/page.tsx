"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Lock,
  PackageCheck,
  Smartphone,
  Truck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useCart } from "@/context/CartContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useToast } from "@/context/ToastContext";
import { useAsyncData, useLocalStorageState } from "@/lib/hooks";
import { provinces as localProvinces } from "@/lib/data/provinces";
import { getShippingConfig, LOCAL_FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { ApiError } from "@/lib/api";
import { saveLocalOrder, submitOrder, type OrderPayload } from "@/lib/orders";
import type { Order, PaymentMethod, UserProfile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ProductImage } from "@/components/product/ProductImage";
import { StatusTimeline } from "@/components/checkout/StatusTimeline";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Métodos de pagamento moçambicanos. Os pagos online (M-Pesa, e-Mola,
 * cartão) são cobrados no gateway do backend — em modo simulado (dev) a
 * cobrança é validada e gera uma referência; com credenciais reais basta
 * trocar PAYMENTS_MODE para live.
 */
const paymentMethods: PaymentMethod[] = [
  {
    id: "cod",
    name: "Pagamento na entrega",
    description: "Pague em dinheiro quando receber o pedido em casa.",
    available: true,
  },
  {
    id: "transfer",
    name: "Transferência bancária",
    description: "MBCI · Standard Bank · BCI · BIM · Absa · FNB · Letshego",
    available: true,
  },
  {
    id: "mpesa",
    name: "M-Pesa",
    description: "Carteira móvel — pagamento rápido pelo telemóvel.",
    available: true,
    paidOnline: true,
    needsPhone: true,
  },
  {
    id: "emola",
    name: "e-Mola",
    description: "Carteira móvel do Movitel.",
    available: true,
    paidOnline: true,
    needsPhone: true,
  },
  {
    id: "card",
    name: "Cartão Visa / Mastercard",
    description: "Pagamento com cartão internacional.",
    available: true,
    paidOnline: true,
    needsCard: true,
  },
];

const methodIcons: Record<string, typeof Banknote> = {
  cod: Banknote,
  transfer: Landmark,
  mpesa: Smartphone,
  emola: Smartphone,
  card: CreditCard,
};

/** Agrupa os dígitos do cartão em blocos de 4 (máx. 19 dígitos). */
function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/** Formata a validade como MM/AA (barra automática, máx. 4 dígitos). */
function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function CheckoutPage() {
  const { format } = useCurrency();
  const { items, subtotal, clear } = useCart();
  const { user: authUser, initializing } = useAuth();
  const { openLogin } = useLoginModal();
  const [profile] = useLocalStorageState<UserProfile | null>("nsm:profile", null);
  const [localUser] = useLocalStorageState<{ email: string; name: string }>("nsm:user", {
    email: "",
    name: "",
  });
  // Sessão (real via token ou login local offline) — sem sessão não se pode comprar.
  const logged = Boolean(authUser || localUser.email || localUser.name);
  const { notify } = useToast();
  // Regras de envio do servidor (fallback para as locais enquanto não carregam).
  const { data: shippingConfig } = useAsyncData(getShippingConfig, []);
  const provinces = shippingConfig?.provinces ?? localProvinces;
  const FREE_SHIPPING_THRESHOLD = shippingConfig?.freeShippingThreshold ?? LOCAL_FREE_SHIPPING_THRESHOLD;
  // Chave de idempotência: única por sessão de finalização — um retry (falha de
  // rede, duplo clique) devolve o mesmo pedido em vez de criar outro.
  const [idemKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `chk-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [method, setMethod] = useState("cod");
  const [province, setProvince] = useState(localProvinces[0].name);
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    notes: "",
  });
  // Dados de pagamento online — M-Pesa/e-Mola (telemóvel) e cartão (simulado).
  const [paymentPhone, setPaymentPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  // Pré-preenche com os dados do perfil quando o utilizador está logado
  // (só na primeira vez / enquanto o formulário ainda estiver vazio).
  // O setState é adiado com queueMicrotask (padrão do projeto) para não
  // disparar atualizações síncronas dentro do efeito.
  useEffect(() => {
    if (!profile?.fullName && !profile?.email && !profile?.phone) return;
    if (form.fullName || form.email || form.phone) return;
    queueMicrotask(() => {
      setForm((f) => ({
        ...f,
        fullName: profile?.fullName ?? "",
        email: profile?.email ?? "",
        phone: profile?.phone ?? "",
      }));
    });
  }, [profile, form.fullName, form.email, form.phone]);

  // Escolher M-Pesa/e-Mola pré-preenche o número com o telefone de entrega.
  const pickMethod = (id: string) => {
    setMethod(id);
    if ((id === "mpesa" || id === "emola") && !paymentPhone.trim() && form.phone.trim()) {
      setPaymentPhone(form.phone);
    }
  };

  const provinceInfo = provinces.find((p) => p.name === province);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : provinceInfo?.fee ?? 0;
  const savings = items.reduce(
    (acc, i) => acc + (i.oldPrice && i.oldPrice > i.price ? (i.oldPrice - i.price) * i.qty : 0),
    0,
  );
  const total = Math.max(0, subtotal - savings) + shipping;

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => m.id === method)!,
    [method],
  );

  // Cliente identificado (conta) — mostra a foto no checkout.
  const displayName = authUser?.fullName || profile?.fullName || "";

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (items.length === 0 && !placedOrder) {
    return (
      <div className="container-nsm flex flex-col items-center py-20 text-center">
        <PackageCheck className="size-12 text-primary-600" />
        <h1 className="mt-4 font-display text-2xl font-bold">Não há nada para finalizar</h1>
        <p className="mt-2 text-sm text-slate-500">
          O seu carrinho está vazio. Adicione produtos antes de avançar para o checkout.
        </p>
        <Button href="/" className="mt-6">
          Ver produtos
        </Button>
      </div>
    );
  }

  /* ── Sucesso ─────────────────────────────────────────────── */
  if (placedOrder) {
    return (
      <div className="container-nsm max-w-3xl py-12">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-8 text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
          <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            Pedido recebido com sucesso!
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Obrigado pela sua compra, {placedOrder.address.fullName.split(" ")[0]}! O seu pedido{" "}
            <strong className="text-slate-900">{placedOrder.id}</strong> foi registado.
          </p>
          <div className="mt-6 rounded-2xl bg-white p-5 text-left">
            <StatusTimeline current={placedOrder.status} />
          </div>
          <p className="mt-5 text-sm text-slate-500">
            Total pago: <strong className="text-slate-900">{format(placedOrder.total)}</strong> ·{" "}
            {selectedMethod.name}
          </p>
          {placedOrder.paymentReference && (
            <p className="mt-2 text-sm text-slate-500">
              Referência de pagamento:{" "}
              <strong className="font-mono text-slate-900">{placedOrder.paymentReference}</strong>
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button href={`/pedido/${placedOrder.id}`} variant="secondary">
              Acompanhar pedido
            </Button>
            <Button href="/" variant="outline">
              Continuar a comprar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Formulário ──────────────────────────────────────────── */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedMethod.available || placing) return;
    if (!logged) {
      notify("Entre na sua conta para finalizar a compra.");
      openLogin();
      return;
    }

    // Valida os dados de pagamento online antes de enviar (o servidor revalida).
    const digits = (s: string) => s.replace(/\D/g, "");
    if (selectedMethod.needsPhone) {
      const p = digits(paymentPhone);
      const ok = (p.length === 9 && p.startsWith("8")) || (p.length === 12 && p.startsWith("258"));
      if (!ok) {
        notify(
          `Indique um número de telemóvel válido para ${selectedMethod.name} (ex.: +258 84 000 0000).`,
        );
        return;
      }
    }
    if (selectedMethod.needsCard) {
      const num = digits(cardNumber);
      if (num.length < 13 || num.length > 19) {
        notify("Número do cartão inválido.");
        return;
      }
      const [mm, yy] = cardExpiry.replace(/\s/g, "").split("/").map((s) => parseInt(s, 10));
      const now = new Date();
      const currentYY = now.getFullYear() % 100;
      const currentMM = now.getMonth() + 1;
      if (!mm || !yy || mm < 1 || mm > 12 || yy < currentYY || (yy === currentYY && mm < currentMM)) {
        notify("Validade do cartão inválida ou expirada (use MM/AA).");
        return;
      }
      const cvc = digits(cardCvc);
      if (cvc.length < 3 || cvc.length > 4) {
        notify("CVC do cartão inválido.");
        return;
      }
    }

    setPlacing(true);
    try {
      const payload: OrderPayload = {
        items: items.map((i) => ({
          productId: i.productId,
          slug: i.slug,
          name: i.name,
          image: i.image,
          price: i.price,
          qty: i.qty,
          variant: i.variant,
        })),
        subtotal,
        shipping,
        discount: savings,
        total,
        paymentMethod: selectedMethod.name,
        // Só o essencial chega ao servidor: telemóvel (carteiras) ou últimos 4
        // dígitos do cartão — o número completo nunca sai do navegador.
        paymentInfo: selectedMethod.needsPhone
          ? { phone: paymentPhone }
          : selectedMethod.needsCard
            ? { cardLast4: digits(cardNumber).slice(-4) }
            : undefined,
        address: { ...form, province },
      };

      // Cria o pedido no backend (guest checkout) com uma perceção mínima de
      // processamento. Em falha, o submitOrder devolve um pedido local.
      const [order] = await Promise.all([
        submitOrder(payload, idemKey),
        new Promise((resolve) => setTimeout(resolve, 700)),
      ]);

      saveLocalOrder(order, authUser?.id); // pedido real (totais recalculados no servidor)
      clear();
      setPlacedOrder(order);
      notify("Pedido registado com sucesso ✅");
    } catch (err) {
      // Erro de validação do backend (ex.: dados de entrega inválidos)
      notify(err instanceof ApiError ? err.message : "Não foi possível registar o pedido");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <RequireAuth redirect fallbackPath="/">
      <div className="container-nsm py-6">
      <h1 className="font-display text-2xl font-extrabold text-slate-900 sm:text-3xl">
        Finalizar compra
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Preencha os seus dados e escolha como prefere pagar. É rápido e seguro.
      </p>

      <form onSubmit={submit} className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Dados do cliente */}
          <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Wallet className="size-5 text-primary-600" /> Dados de entrega
            </h2>
            {displayName && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-primary-50/70 px-3.5 py-2.5">
                <Avatar
                  src={authUser?.avatar ?? profile?.avatar}
                  name={displayName}
                  className="size-8"
                  textClassName="text-xs"
                />
                <p className="text-sm text-slate-700">
                  A comprar como{" "}
                  <span className="font-semibold text-slate-900">{displayName.split(" ")[0]}</span>
                </p>
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Nome completo"
                required
                value={form.fullName}
                onChange={set("fullName")}
                placeholder="Ex.: Anabela dos Santos"
                autoComplete="name"
              />
              <Input
                label="Telefone"
                required
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="+258 84 000 0000"
                autoComplete="tel"
              />
              <Input
                label="Email"
                required
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="nome@email.com"
                autoComplete="email"
                className="sm:col-span-2"
              />
              <Textarea
                label="Endereço (rua, bairro, referência)"
                required
                value={form.address}
                onChange={set("address")}
                placeholder="Ex.: Av. Julius Nyerere, Bairro Sommerschield, perto do supermercado…"
                className="sm:col-span-2"
              />
              <Input
                label="Cidade"
                required
                value={form.city}
                onChange={set("city")}
                placeholder="Ex.: Maputo"
                autoComplete="address-level2"
              />
              <Select
                label="Província"
                required
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                {provinces.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Textarea
                label="Observações (opcional)"
                value={form.notes}
                onChange={set("notes")}
                placeholder="Instruções de entrega, horários, etc."
                className="sm:col-span-2"
                rows={2}
              />
            </div>
          </section>

          {/* Pagamento */}
          <section className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Lock className="size-5 text-primary-600" /> Método de pagamento
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {paymentMethods.map((m) => {
                const Icon = methodIcons[m.id];
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!m.available}
                    onClick={() => pickMethod(m.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative flex flex-col gap-1 rounded-2xl border-2 p-4 text-left transition",
                      active
                        ? "border-primary-600 bg-primary-50/60"
                        : m.available
                          ? "border-slate-200 hover:border-slate-300"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60",
                    )}
                  >
                    {m.badge && (
                      <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                        {m.badge}
                      </span>
                    )}
                    <span className="flex items-center gap-2 font-semibold text-slate-800">
                      <Icon className="size-4.5 text-primary-600" /> {m.name}
                    </span>
                    <span className="pr-14 text-xs leading-relaxed text-slate-500">
                      {m.description}
                    </span>
                    {active && (
                      <span className="absolute bottom-3 right-3 text-primary-600">
                        <CheckCircle2 className="size-5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dados de pagamento online — carteiras móveis e cartão */}
            {selectedMethod.needsPhone && (
              <div className="mt-4 rounded-2xl bg-slate-50/80 p-4">
                <Input
                  label={`Número de ${selectedMethod.name}`}
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={paymentPhone}
                  onChange={(e) => setPaymentPhone(e.target.value)}
                  placeholder="+258 84 000 0000"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  O pagamento é pedido ao número indicado. Em desenvolvimento o
                  processo é simulado — nenhuma transação real é feita.
                </p>
              </div>
            )}

            {selectedMethod.needsCard && (
              <div className="mt-4 rounded-2xl bg-slate-50/80 p-4">
                <p className="text-sm font-semibold text-slate-700">Dados do cartão</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Número do cartão"
                    required
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    className="sm:col-span-2"
                  />
                  <Input
                    label="Validade (MM/AA)"
                    required
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/AA"
                  />
                  <Input
                    label="CVC"
                    required
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    type="password"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Ambiente de demonstração: o pagamento é simulado e nenhum dado
                  real do cartão é guardado ou enviado.
                </p>
              </div>
            )}

            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="size-3.5" />
              Pagamento seguro · os dados são encriptados e nunca partilhados.
            </p>
          </section>
        </div>

        {/* Resumo */}
        <aside className="h-fit space-y-4 lg:sticky lg:top-32">
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">O seu pedido</h2>
            <ul className="mt-4 space-y-3">
              {items.map((i) => (
                <li key={i.productId + (i.variant ?? "")} className="flex items-center gap-3">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    <ProductImage
                      src={i.image}
                      alt={i.name}
                      fill
                      sizes="56px"
                      label={i.name}
                      imgClassName="object-cover"
                    />
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-white">
                      {i.qty}
                    </span>
                  </span>
                  <p className="line-clamp-2 flex-1 text-xs font-medium text-slate-700">{i.name}</p>
                  <p className="text-sm font-semibold text-slate-800 tabular-nums">
                    {format(i.price * i.qty)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
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
                  <Truck className="size-4 text-primary-500" /> Entrega ({province})
                </dt>
                <dd className={cn("font-semibold", shipping === 0 ? "text-emerald-600" : "text-slate-800")}>
                  {shipping === 0 ? "Grátis" : format(shipping)}
                </dd>
              </div>
              {provinceInfo && shipping > 0 && (
                <p className="text-xs text-slate-400">
                  Estimativa: {provinceInfo.days[0]}–{provinceInfo.days[1]} dias úteis
                </p>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <dt className="font-bold text-slate-900">TOTAL</dt>
                <dd className="font-display text-xl font-extrabold text-slate-900 tabular-nums">
                  {format(total)}
                </dd>
              </div>
            </dl>
          </div>

          {initializing || logged ? (
            <Button type="submit" size="lg" fullWidth loading={placing}>
              {placing ? "A processar…" : `Confirmar pedido · ${format(total)}`}
            </Button>
          ) : (
            <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 text-center">
              <p className="text-sm font-semibold text-slate-800">
                Entre na sua conta para finalizar a compra
              </p>
              <p className="mt-1 text-xs text-slate-500">
                O seu carrinho fica guardado enquanto entra na sua conta.
              </p>
              <Button onClick={openLogin} size="lg" fullWidth className="mt-3">
                Entrar / Registar-se
              </Button>
            </div>
          )}
          <p className="text-center text-xs text-slate-400">
            Ao confirmar, concorda com os{" "}
            <Link href="/termos" className="text-primary-600 underline underline-offset-2">
              Termos e condições
            </Link>
            .
          </p>
        </aside>
      </form>
    </div>
  </RequireAuth>
  );
}
