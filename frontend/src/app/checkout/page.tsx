"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  Lock,
  MapPin,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useCart } from "@/context/CartContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useToast } from "@/context/ToastContext";
import { useAsyncData, useLocalStorageState } from "@/lib/hooks";
import { provinces as localProvinces } from "@/lib/data/provinces";
import { getShippingConfig, LOCAL_FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { paymentMethods } from "@/lib/payments";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { getStoredUser, saveLocalOrder, submitOrder, type OrderPayload } from "@/lib/orders";
import { saveMyAddresses } from "@/lib/addresses";
import { cn } from "@/lib/utils";
import type { AddressBookEntry, Coupon, Order, UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ProductImage } from "@/components/product/ProductImage";
import { StatusTimeline } from "@/components/checkout/StatusTimeline";
import { Modal } from "@/components/ui/Modal";

/* Métodos de pagamento moçambicanos — definidos em `@/lib/payments` para a
   homepage poder anunciar exatamente os mesmos métodos. */

/** Fundo de cada quadrado — a cor da marca de cada método. */
const methodBg: Record<string, string> = {
  mpesa: "bg-white",
  emola: "bg-[#FFCE00]",
  mkesh: "bg-white",
  card: "bg-white",
};

/** Logótipos oficiais (ficheiro local em /public/payments). */
const methodLogos: Record<string, { src: string; alt: string }> = {
  mpesa: { src: "/payments/m-pesa.png", alt: "M-Pesa" },
  emola: { src: "/payments/emola.png", alt: "e-Mola" },
  mkesh: { src: "/payments/mkesh.svg", alt: "mKesh" },
  card: { src: "/payments/visa.jpg", alt: "Visa / Mastercard" },
};

export default function CheckoutPage() {
  const { format } = useCurrency();
  const { items, subtotal, clear } = useCart();
  const { user: authUser } = useAuth();
  // Foto de perfil: do servidor quando há sessão (cada conta tem a sua).
  const { openLogin } = useLoginModal();
  const [profile] = useLocalStorageState<UserProfile | null>("nsm:profile", null);
  // Sessão local (login offline) lida **sem escrever** a chave `nsm:user`:
  // gravá-la com o valor por omissão marcava o convidado como «sessão existente»
  // e o arranque da autenticação (que falha em `/api/auth/me` e depois em
  // `/api/auth/refresh`) expulsava-o para a página inicial no carregamento seguinte.
  const [localUser, setLocalUser] = useState<{ email: string; name: string } | null>(null);
  useEffect(() => {
    // Leitura após montar (o localStorage não existe no servidor) e por microtask,
    // para não disparar um setState síncrono dentro do efeito.
    const stored = getStoredUser();
    queueMicrotask(() => setLocalUser(stored));
  }, []);
  // Sessão (real via token ou login local offline). **Não** é um pré-requisito:
  // o checkout é público (o backend aceita convidados, `POST /api/orders`) — a
  // conta serve só para pré-preencher dados e ligar o pedido ao histórico.
  const logged = Boolean(authUser || localUser);
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
  const [method, setMethod] = useState("mpesa");
  const [province, setProvince] = useState(localProvinces[0].name);
  const [placing, setPlacing] = useState(false);
  /** Rótulos de método disponíveis segundo o backend (vazio = todos). */
  const [methodAvailability, setMethodAvailability] = useState<Set<string>>(() => new Set());
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  // Código do cupão aplicado — dependência estável dos efeitos de validação.
  const appliedCouponCode = coupon?.code ?? "";
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    notes: "",
  });
  // Dados de pagamento online — NÃO são recolhidos aqui: todos os métodos
  // pagos online usam link de pagamento (checkout hospedado — PaySuite em
  // produção, página simulada em dev). O cliente só seleciona o método e,
  // ao comprar, é encaminhado para o link; quem recolhe telefone/cartão é a
  // página do provedor.
  const [addrModalOpen, setAddrModalOpen] = useState(false);


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

  // ── Dados de entrega guardados (livro de endereços de /configuracoes) ──
  // O checkout mostra os dados GRAVADOS em modo de leitura — o cliente não
  // repete nada a cada compra. Só edita (substituir) ou insere (primeira vez).
  const [, setSavedAddress] = useState<AddressBookEntry | null>(null);
  // Gestor de endereços no modal (idêntico às definições): lista, adição e GPS.
  const [addressList, setAddressList] = useState<AddressBookEntry[]>([]);
  const [addingAddr, setAddingAddr] = useState(false);
  const [locating, setLocating] = useState(false);
  const [newAddr, setNewAddr] = useState({
    label: "",
    fullName: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    coords: undefined as AddressBookEntry["coords"],
  });
  // Endereço padrão (ou o primeiro) — o que a encomenda usa e a secção mostra.
  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0] ?? null;

  // Carrega o endereço padrão (ou o primeiro) uma vez, no arranque, e pré-
  // preenche o formulário em silêncio — a UI já não mostra campos de entrega,
  // mas o payload da encomenda continua a levar os dados guardados.
  // queueMicrotask: evita setState síncrono dentro do efeito (padrão do projeto).
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem("nsm:addresses");
        if (!raw) return;
        const list = JSON.parse(raw) as AddressBookEntry[];
        setAddressList(list);
        const addr = list.find((a) => a.isDefault) ?? list[0] ?? null;
        if (!addr) return;
        setSavedAddress(addr);
        setForm((f) => ({
          ...f,
          fullName: f.fullName || addr.fullName,
          phone: f.phone || addr.phone,
          address: f.address || addr.address,
          city: f.city || addr.city,
        }));
        setProvince((cur) =>
          cur === localProvinces[0].name && addr.province ? addr.province : cur,
        );
      } catch {
        /* armazenamento indisponível ou JSON inválido */
      }
    });
  }, []);

  // Revalida o cupão aplicado quando o subtotal muda (mínimo e percentagem
  // dependem do subtotal) — o desconto é sempre recalculado pelo servidor.
  useEffect(() => {
    if (!appliedCouponCode) return;
    let cancelled = false;
    // queueMicrotask: evita setState síncrono dentro do efeito (padrão do projeto).
    queueMicrotask(() => {
      if (!cancelled) setValidatingCoupon(true);
    });

    apiPost<{ data: { discount: number } }>("/api/orders/validate-coupon", { code: appliedCouponCode, subtotal })
      .then((res) => {
        if (cancelled) return;
        setCouponError("");
        setCoupon((current) => (current ? { ...current, discount: res.data.discount } : current));
      })
      .catch((err) => {
        if (cancelled) return;
        setCoupon(null);
        setCouponError(err instanceof ApiError ? err.message : "Cupão inválido.");
      })
      .finally(() => {
        if (!cancelled) setValidatingCoupon(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedCouponCode, subtotal]);

  // Métodos de pagamento disponíveis AGORA (o backend desliga os pagos online
  // quando não há gateway): sem isto, o cliente escolhia M-Pesa e só via 503 no
  // fim do checkout. A falha é ignorada — em caso de dúvida, mostram-se todos
  // (o backend rejeita com 503 se o método não for cobrável).
  useEffect(() => {
    let cancelled = false;
    apiGet<{ data: { methods: string[]; hostedCheckout?: boolean } }>("/api/payments/methods", 60_000)
      .then((res) => {
        if (cancelled || !res.data?.methods) return;
        const available = new Set(res.data.methods);
        setMethodAvailability(() => available);
        // Se o método selecionado ficou indisponível, volta ao primeiro da lista
        // (M-Pesa). Não há um método «de recurso» sem validação: os pagamentos
        // online são a única via aceite no checkout.
        setMethod((current) => (available.has(current) ? current : "mpesa"));
      })
      .catch(() => {
        /* sem sinal do backend: mantém todos visíveis (comportamento anterior) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Escolhe o método de pagamento — só isso. O link de pagamento é gerado ao
   * comprar; os dados do método (telefone/cartão) são pedidos na página do
   * provedor, não aqui.
   */
  const pickMethod = (id: string) => {
    setMethod(id);
  };

  const provinceInfo = provinces.find((p) => p.name === province);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : provinceInfo?.fee ?? 0;
  const savings = items.reduce(
    (acc, i) => acc + (i.oldPrice && i.oldPrice > i.price ? (i.oldPrice - i.price) * i.qty : 0),
    0,
  );
  const couponDiscount = coupon?.discount ?? 0;
  const discount = savings + couponDiscount;
  const total = Math.max(0, subtotal - savings - couponDiscount) + shipping;
  // Percentagem poupada nos preços riscados (rótulo do resumo).
  const discountPct = subtotal > 0 ? `-${Math.round((savings / subtotal) * 100)}%` : "";

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => m.id === method)!,
    [method],
  );

  // Cliente identificado (conta) — mostra a foto no checkout.

  if (items.length === 0 && !placedOrder) {
    return (
      <div className="container-nsm py-6 pb-28">
        <div className="flex flex-col items-center py-14 text-center">
          <PackageCheck className="size-12 text-primary-600" />
          <h1 className="mt-4 font-display text-2xl font-bold">Não há nada para finalizar</h1>
        <p className="mt-2 text-sm text-slate-500">
          O seu carrinho está vazio. Adicione produtos antes de avançar para o checkout.
        </p>
        <Button href="/" className="mt-6">
          Ver produtos
        </Button>
        </div>
      </div>
    );
  }

  /* ── Sucesso ─────────────────────────────────────────────── */
  if (placedOrder) {
    return (
      <div className="container-nsm py-6 pb-28">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-8 text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-700" />
          <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            Pedido recebido com sucesso!
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Obrigado pela sua compra, {placedOrder.address.fullName.split(" ")[0]}! O seu pedido{" "}
            <strong className="text-slate-900">{placedOrder.id}</strong> foi registado.
          </p>
          <div className="mt-6 rounded-2xl bg-surface p-5 text-left">
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
            <Button
              href={`/pedido/${placedOrder.id}${placedOrder.address.email ? `?email=${encodeURIComponent(placedOrder.address.email)}` : ""}`}
              variant="secondary"
            >
              Acompanhar pedido
            </Button>
            <Button href="/" variant="outline">
              Continuar a comprar
            </Button>
          </div>
        </div>
      </div>
    </div>
    );
  }

  /* ── Formulário ──────────────────────────────────────────── */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedMethod.available || placing) return;
    // Sem dados de entrega guardados, a encomenda não pode ser enviada:
    // encaminha para «Dados de entrega» nas definições (a UI do checkout já
    // não tem campos de entrega, a pedido).
    if (!form.fullName || !form.address || !form.phone || !form.city) {
      // Sem dados guardados: abre o próprio modal de endereços aqui no checkout.
      setAddrModalOpen(true);
      return;
    }

    // Sem validação de telefone/cartão: quem os recolhe é a página do link de
    // pagamento (PaySuite em produção, página simulada em dev) — o servidor
    // também não os exige com checkout hospedado.

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
        discount,
        total,
        paymentMethod: selectedMethod.name,
        // Sem paymentInfo: os dados do método são recolhidos na página do
        // provedor (checkout hospedado) — nada de cartão no nosso servidor.
        address: { ...form, province },
        couponCode: coupon?.code || undefined,
      };

      // Cria o pedido no backend (guest checkout) com uma perceção mínima de
      // processamento. Em falha, o submitOrder devolve um pedido local.
      const [order] = await Promise.all([
        submitOrder(payload, idemKey),
        new Promise((resolve) => setTimeout(resolve, 700)),
      ]);

      saveLocalOrder(order, authUser?.id); // pedido real (totais recalculados no servidor)
      clear();
      // Todos os métodos pagos online devolvem um link de pagamento (checkout
      // hospedado — PaySuite ou página simulada). Redirecionar é o passo
      // seguinte: o cliente "aguarda o link" e é encaminhado quando ele chega.
      if (order.checkoutUrl) {
        // `assign` (e não a atribuição a `location.href`): navegação para a
        // página de pagamento, sem perder o histórico da loja.
        window.location.assign(order.checkoutUrl);
        return;
      }
      setPlacedOrder(order);
      notify("Pedido registado com sucesso ✅");
    } catch (err) {
      // Erro de validação do backend (ex.: dados de entrega inválidos)
      notify(err instanceof ApiError ? err.message : "Não foi possível registar o pedido");
    } finally {
      setPlacing(false);
    }
  };

  const validateCoupon = async (code: string) => {
    if (!code.trim()) {
      setCouponError("Introduza um código de cupão.");
      return;
    }
    setValidatingCoupon(true);
    setCouponError("");
    try {
      // A API responde com o envelope { data: {...} } (igual a todas as outras
      // chamadas) — sem desembrulhar, `code`/`discount` eram undefined e o
      // cupão nunca era aplicado nem enviado no pedido.
      const { data } = await apiPost<{
        data: {
          code: string;
          discountType: string;
          discountValue: number;
          discount: number;
          minimumSubtotal?: number;
        };
      }>("/api/orders/validate-coupon", { code, subtotal });
      setCoupon({
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discount: data.discount,
        minimumSubtotal: data.minimumSubtotal,
      });
    } catch (err) {
      setCoupon(null);
      setCouponError(err instanceof ApiError ? err.message : "Cupão inválido.");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      setCoupon(null);
      setCouponError("");
      return;
    }
    await validateCoupon(couponCode);
  };

  /** Marca as coordenadas atuais (GPS) no novo endereço. */
  const locateMe = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      notify("O seu navegador não suporta geolocalização.", "info");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setNewAddr((p) => ({ ...p, coords: { lat, lng } }));
        setLocating(false);
        notify("Localização marcada no mapa.");
      },
      () => {
        setLocating(false);
        notify("Não foi possível obter a sua localização.", "info");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  /** Guarda o endereço do modal no livro (local + servidor, se houver sessão). */
  const saveAddressFromModal = (entry: AddressBookEntry) => {
    const exists = addressList.some((a) => a.id === entry.id);
    const next = exists
      ? addressList.map((a) => (a.id === entry.id ? { ...a, ...entry } : a))
      : [...addressList.map((a) => ({ ...a, isDefault: false })), entry];
    setAddressList(next);
    try {
      window.localStorage.setItem("nsm:addresses", JSON.stringify(next));
      void saveMyAddresses(next);
    } catch {
      /* armazenamento indisponível */
    }
    setSavedAddress(entry);
    // Pré-preenche o formulário da encomenda com o endereço escolhido.
    setForm((f) => ({
      ...f,
      fullName: f.fullName || entry.fullName,
      phone: f.phone || entry.phone,
      address: f.address || entry.address,
      city: f.city || entry.city,
    }));
    setProvince((cur) => (cur === localProvinces[0].name && entry.province ? entry.province : cur));
    notify("Endereço guardado ✅");
  };

  return (
    <div className="container-nsm py-6 pb-28">
      <form onSubmit={submit} className="mt-6 px-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Dados de entrega — o endereço padrão aparece gravado; o botão
              tracejado abre o gestor (modal) para adicionar outro. */}
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">Endereços de Entrega</h3>

            {defaultAddress ? (
              <div>
                {defaultAddress.isDefault && (
                  <span className="absolute right-3 top-3 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                    PADRÃO
                  </span>
                )}
                <p className="font-bold text-slate-900">{defaultAddress.label}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {defaultAddress.fullName} · {defaultAddress.phone}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {defaultAddress.address}, {defaultAddress.city} — {defaultAddress.province}
                </p>
                {defaultAddress.coords && (
                  <a
                    href={`https://www.google.com/maps?q=${defaultAddress.coords.lat},${defaultAddress.coords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-primary-700 transition hover:underline"
                  >
                    <MapPin className="size-3" aria-hidden />
                    {defaultAddress.coords.lat.toFixed(6)}, {defaultAddress.coords.lng.toFixed(6)}
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">
                Ainda não tem endereços guardados.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setAddingAddr(false);
                setAddrModalOpen(true);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 py-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 active:scale-[0.99]"
            >
              <Plus className="size-4" aria-hidden /> Adicionar novo endereço
            </button>
          </div>

          {/* Cupão */}
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">Cupão de desconto</h2>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.trim().toUpperCase())}
                // O placeholder não é um rótulo: sem isto o campo não tinha nome acessível.
                aria-label="Código do cupão de desconto"
                placeholder="EX: NOVO2024"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              <Button
                type="button"
                size="sm"
                onClick={applyCoupon}
                loading={validatingCoupon}
                disabled={!couponCode.trim()}
              >
                Aplicar
              </Button>
            </div>
            {couponError && <p className="mt-2 text-xs text-red-600">{couponError}</p>}
            {coupon && (
              <p className="mt-2 text-xs text-emerald-700">
                Cupão aplicado: {format(couponDiscount)} ({coupon.discountType === "PERCENT" ? "%" : "MT"})
                <button
                  type="button"
                  onClick={() => {
                    setCoupon(null);
                    setCouponError("");
                    setCouponCode("");
                  }}
                  className="ml-2 underline hover:text-red-600"
                >
                  Remover
                </button>
              </p>
            )}
          </div>

          {/* Pagamento */}
          <section>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Lock className="size-5 text-primary-600" /> Método de pagamento
            </h2>
            {/* Logótipos oficiais numa única linha — o cliente só SELECIONA o
                método; o link de pagamento é gerado ao comprar. */}
            {/* 4 métodos (M-Pesa, e-Mola, mKesh, cartão) — 2 colunas no telemóvel,
                4 em linha no desktop. */}
            <div className="mt-4 grid grid-cols-2 gap-3 place-items-center sm:grid-cols-4">
              {paymentMethods.map((m) => {
                const logo = methodLogos[m.id];
                const active = method === m.id;
                // Disponibilidade efetiva: o campo `available` estático E o que o
                // backend diz (pagos online desligados sem gateway). Quando a lista
                // do backend ainda não chegou (Set vazio), assume-se disponível.
                const backendUnavailable = methodAvailability.size > 0 && !methodAvailability.has(m.name);
                const isAvailable = m.available && !backendUnavailable;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!isAvailable}
                    title={m.name}
                    onClick={() => pickMethod(m.id)}
                    aria-pressed={active}
                    className={cn(
                      // Fundo da marca: M-Pesa vermelho, e-Mola amarelo, Visa branco.
                      // Sem px/py dentro do quadrado.
                      "relative flex h-20 w-20 items-center justify-center rounded-xl border-2 transition active:scale-[0.98]",
                      methodBg[m.id],
                      active
                        ? "border-primary-600 ring-2 ring-primary-600/20"
                        : isAvailable
                          ? "border-slate-200 hover:border-slate-300"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.src} alt={logo.alt} className="max-h-20 w-auto rounded-lg object-contain" />
                  </button>
                );
              })}
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="size-3.5" />
              Pagamento seguro · ao comprar recebe um link para concluir com o
              método escolhido (a página do provedor é que pede o número/cartão).
            </p>
          </section>

        </div>

        {/* Resumo */}
        <aside className="h-fit space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">O seu pedido</h2>
            <ul className="mt-4 space-y-3">
              {items.map((i, itemIdx) => (
                <li key={`${i.productId}|${i.variant ?? ""}|${itemIdx}`} className="flex items-center gap-3">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    <ProductImage
                      src={i.image}
                      alt={i.name}
                      fill
                      sizes="56px"
                      label={i.name}
                      imgClassName="object-cover"
                    />
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
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
                <div className="flex justify-between text-emerald-700">
                  <dt>Desconto ({discountPct})</dt>
                  <dd className="font-semibold">-{format(savings)}</dd>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Cupão ({coupon?.code})</dt>
                  <dd className="font-semibold">-{format(couponDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <Truck className="size-4 text-primary-500" /> Entrega ({province})
                </dt>
                <dd className={cn("font-semibold", shipping === 0 ? "text-emerald-700" : "text-slate-800")}>
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

          {/* Desktop: o CTA vive aqui, abaixo do resumo. No telemóvel fica na
              barra fixa do fundo. */}
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={placing}
            disabled={items.length === 0}
            className="hidden md:flex"
          >
            {placing && selectedMethod?.paidOnline
              ? "A aguardar o link de pagamento…"
              : placing
                ? "A processar…"
                : "Comprar"}
          </Button>

          {!logged && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Já tem conta?{" "}
              <button
                type="button"
                onClick={openLogin}
                className="inline-block py-1 font-semibold text-primary-600 underline underline-offset-2"
              >
                Entre para preencher os dados
              </button>
            </p>
          )}
          <p className="text-center text-xs text-slate-400">
            Ao confirmar, concorda com os{" "}
            <Link href="/termos" className="text-primary-600 underline underline-offset-2">
              Termos e condições
            </Link>
            .
          </p>
        </aside>

        {/* Barra fixa removida a pedido */}
      </form>

      {/* Modal do gestor de endereços — idêntico às definições: lista,
          adição com GPS e sincronização com o livro (nsm:addresses). */}
      <Modal
        open={addrModalOpen}
        onClose={() => {
          setAddrModalOpen(false);
          setAddingAddr(false);
        }}
        title="Dados de entrega"
        size="lg"
      >
        <div>
          {addressList.length === 0 && !addingAddr && (
            <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">
              Ainda não tem endereços guardados.
            </p>
          )}

          <div className="space-y-3">
            {addressList.map((a) => (
              <div key={a.id} className="relative rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                {a.isDefault && (
                  <span className="absolute right-3 top-3 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                    PADRÃO
                  </span>
                )}
                <p className="font-bold text-slate-900">{a.label}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {a.fullName} · {a.phone}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {a.address}, {a.city} — {a.province}
                </p>
                {a.coords && (
                  <a
                    href={`https://www.google.com/maps?q=${a.coords.lat},${a.coords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-primary-700 transition hover:underline"
                  >
                    <MapPin className="size-3" aria-hidden />
                    {a.coords.lat.toFixed(6)}, {a.coords.lng.toFixed(6)}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = addressList.filter((x) => x.id !== a.id);
                    setAddressList(next);
                    try {
                      window.localStorage.setItem("nsm:addresses", JSON.stringify(next));
                      void saveMyAddresses(next);
                    } catch {
                      /* ignora */
                    }
                  }}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-red-600"
                >
                  <Trash2 className="size-3.5" aria-hidden /> Remover
                </button>
              </div>
            ))}
          </div>

          {addingAddr ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const entry: AddressBookEntry = {
                  id: `a-${Date.now()}`,
                  label: newAddr.label,
                  fullName: newAddr.fullName,
                  phone: newAddr.phone,
                  address: newAddr.address,
                  city: newAddr.city,
                  province: newAddr.province || localProvinces[0].name,
                  isDefault: addressList.length === 0,
                  coords: newAddr.coords,
                };
                saveAddressFromModal(entry);
                setNewAddr({
                  label: "",
                  fullName: "",
                  phone: "",
                  address: "",
                  city: "",
                  province: "",
                  coords: undefined,
                });
                setAddingAddr(false);
                setAddrModalOpen(false);
              }}
              className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4"
            >
              <p className="flex items-center gap-2 font-display font-bold text-slate-900">
                <Plus className="size-4 text-primary-600" aria-hidden /> Novo endereço
              </p>
              <Input
                label="Identificação (ex.: Casa, Escritório)"
                required
                value={newAddr.label}
                onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Nome"
                  required
                  value={newAddr.fullName}
                  onChange={(e) => setNewAddr({ ...newAddr, fullName: e.target.value })}
                />
                <Input
                  label="Telefone"
                  required
                  value={newAddr.phone}
                  onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                />
              </div>
              <Textarea
                label="Endereço"
                required
                value={newAddr.address}
                onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Cidade"
                  required
                  value={newAddr.city}
                  onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                />
                <Select
                  label="Província"
                  value={newAddr.province || localProvinces[0].name}
                  onChange={(e) => setNewAddr({ ...newAddr, province: e.target.value })}
                >
                  {provinces.map((pr) => (
                    <option key={pr.name} value={pr.name}>
                      {pr.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <MapPin className="size-4 text-slate-400" aria-hidden /> Localização (GPS)
                </p>
                {newAddr.coords ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs text-slate-500">
                        {newAddr.coords.lat.toFixed(6)}, {newAddr.coords.lng.toFixed(6)}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={locateMe}
                          disabled={locating}
                          className="text-xs font-semibold text-primary-700 transition hover:underline disabled:opacity-50"
                        >
                          {locating ? "A atualizar…" : "Atualizar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewAddr((pr) => ({ ...pr, coords: undefined }))}
                          className="text-xs font-semibold text-red-600 transition hover:underline"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={locateMe}
                    disabled={locating}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 py-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 active:scale-[0.99] disabled:opacity-60"
                  >
                    {locating ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <MapPin className="size-4" aria-hidden />
                    )}
                    {locating ? "A obter a sua localização…" : "Marcar a minha localização atual"}
                  </button>
                )}
                <p className="mt-1.5 text-xs text-slate-500">
                  Ao tocar, marcamos automaticamente as suas coordenadas atuais (GPS) — opcional.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAddingAddr(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <Button type="submit">Guardar endereço</Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingAddr(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 py-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 active:scale-[0.99]"
            >
              <Plus className="size-4" aria-hidden /> Adicionar endereço
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
