"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
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
import { isProviderPaymentLink, paymentMethods } from "@/lib/payments";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { getStoredUser, saveLocalOrder, submitOrder, type OrderPayload } from "@/lib/orders";
import { saveMyAddresses } from "@/lib/addresses";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { site, whatsappHref } from "@/config/site";
import type { AddressBookEntry, Coupon, Order, UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ProductImage } from "@/components/product/ProductImage";
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
const methodLogos: Partial<Record<string, { src: string; alt: string }>> = {
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
  /** Rótulos de método disponíveis segundo o backend. */
  const [methodAvailability, setMethodAvailability] = useState<Set<string>>(() => new Set());
  /**
   * A lista do backend já chegou? Distingue "ainda não sabemos" (mostrar todos,
   * como antes) de "não há nenhum método" (loja sem gateway) — sem isto, uma
   * lista vazia voltava a ativar métodos que só responderiam 503.
   */
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  // Contagem dos 3 s antes de abrir o link do provedor (null = sem link).
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
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
  // pagos online usam link de pagamento (checkout hospedado da PaySuite). O
  // cliente só seleciona o método e, ao comprar, é encaminhado para o link —
  // que vem do provedor, ou é colado pelo admin quando o gateway não o devolve.
  const [addrModalOpen, setAddrModalOpen] = useState(false);
  // Endereço escolhido para ESTE pedido (o padrão só serve de valor inicial):
  // com vários endereços guardados, o cliente tem de poder trocar a morada sem
  // ir às definições.
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);


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
  // Endereço usado pela encomenda: o escolhido, ou o padrão, ou o primeiro.
  const selectedAddress =
    addressList.find((a) => a.id === selectedAddressId) ??
    addressList.find((a) => a.isDefault) ??
    addressList[0] ??
    null;

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
        setSelectedAddressId(addr.id);
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
        setAvailabilityLoaded(true);
        // Se o método selecionado ficou indisponível (sem gateway, todos os
        // métodos saem da lista), passa ao primeiro que o backend aceita. A
        // comparação é por NOME: o backend devolve rótulos e o estado guarda ids.
        setMethod((current) => {
          const currentName = paymentMethods.find((m) => m.id === current)?.name;
          if (currentName && available.has(currentName)) return current;
          return paymentMethods.find((m) => available.has(m.name))?.id ?? current;
        });
      })
      .catch(() => {
        /* sem sinal do backend: mantém todos visíveis (comportamento anterior) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Link do provedor: mostra 3 s de processamento e abre automaticamente.
   * O botão «Pagar agora» no ecrã cobre o caso de o browser bloquear a
   * navegação (ou de o cliente querer abrir noutro separador).
   *
   * Só links EXTERNOS (o checkout da PaySuite, ou o link que o admin colou no
   * pedido) abrem sozinhos — um endereço da própria loja nunca é um link de
   * pagamento a abrir no ecrã do cliente.
   */
  useEffect(() => {
    const url = placedOrder?.checkoutUrl;
    if (!url || !isProviderPaymentLink(url)) return;
    const tick = window.setInterval(
      () => setRedirectSeconds((s) => (s == null ? null : Math.max(0, s - 1))),
      1000,
    );
    const go = window.setTimeout(() => window.location.assign(url), 3000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [placedOrder]);

  /**
   * Escolhe o método de pagamento — só isso. O link é gerado ao comprar; os
   * dados do método (telefone/cartão) são pedidos na página do provedor.
   */
  const pickMethod = (id: string) => {
    setMethod(id);
  };

  const provinceInfo = provinces.find((p) => p.name === province);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : provinceInfo?.fee ?? 0;
  // O subtotal já usa o preço promocional (`price`); o preço riscado
  // (`oldPrice`) é referência visual e NÃO se subtrai outra vez. O único
  // desconto que mexe no total é o cupão.
  const couponDiscount = coupon?.discount ?? 0;
  const discount = couponDiscount;
  const total = Math.max(0, subtotal - couponDiscount) + shipping;

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => m.id === method)!,
    [method],
  );
  // Disponibilidade efetiva do método escolhido: o backend desliga os métodos
  // pagos online quando não há gateway, por isso não basta o `available` estático.
  const selectedMethodAvailable =
    selectedMethod.available &&
    (!availabilityLoaded || methodAvailability.has(selectedMethod.name));
  const onlinePaymentsAvailable =
    !availabilityLoaded ||
    paymentMethods.some((m) => m.paidOnline && methodAvailability.has(m.name));

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

  /* ── Ecrã de confirmação ────────────────────────────────── */
  if (placedOrder) {
    // Mensagem que o cliente envia ao fornecedor (WhatsApp) já preenchida:
    // código da compra, data, artigos com quantidades e total a pagar.
    const orderDate = formatDate(placedOrder.date);
    const itemsList = placedOrder.items
      .map((i) => `• ${i.qty}× ${i.name} — ${format(i.price * i.qty)}`)
      .join("\n");
    const supplierMessage =
      `Olá! Acabei de fazer o pedido ${placedOrder.id} na ${site.name}.\n` +
      `Data: ${orderDate}\n` +
      `Artigos:\n${itemsList}\n` +
      `Total a pagar: ${format(placedOrder.total)}\n` +
      `Método: ${placedOrder.paymentMethod}\n` +
      `Obrigado!`;
    // Link de pagamento do PROVEDOR (o tipo que o admin também envia). Um link
    // interno da loja não abre sozinho nem é «Pagar agora».
    const providerLink = isProviderPaymentLink(placedOrder.checkoutUrl);
    // Pago online sem link do gateway: a loja vai enviar o link.
    const awaitingLink =
      !placedOrder.checkoutUrl &&
      (paymentMethods.find((m) => m.name === placedOrder.paymentMethod)?.paidOnline ?? false);
    return (
      <div className="container-nsm py-6 pb-28">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-100">
              {providerLink ? (
                <Loader2 className="size-8 animate-spin text-primary-700" aria-hidden />
              ) : (
                <CheckCircle2 className="size-8 text-primary-700" aria-hidden />
              )}
            </span>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
              {providerLink ? "A processar o pagamento…" : "Pedido registado"}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              O seu pedido <strong className="text-slate-900">{placedOrder.id}</strong> foi
              registado.{" "}
              {providerLink ? (
                <>
                  Vamos abrir a página segura de pagamento
                  {redirectSeconds != null ? ` em ${redirectSeconds} s` : ""} — se não
                  abrir, use o botão «Pagar agora».
                </>
              ) : placedOrder.checkoutUrl ? (
                <>
                  Abra a página de pagamento para concluir a compra.
                </>
              ) : awaitingLink ? (
                <>
                  A loja foi notificada e vai enviar-lhe o link de pagamento por email
                  (e WhatsApp, se tiver o canal ligado) assim que estiver pronto.
                </>
              ) : (
                <>
                  Combinamos consigo a entrega e o pagamento. Fale com o agente de
                  compra se precisar de alguma coisa.
                </>
              )}
            </p>
          </div>

          {/* Resumo da compra: o que o cliente vai pagar */}
          <div className="mt-5 rounded-2xl border border-slate-100 bg-surface p-5">
            <h2 className="font-display text-base font-bold text-slate-900">Resumo da compra</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {placedOrder.items.map((i, itemIdx) => (
                <li key={`${i.productId}|${i.variant ?? ""}|${itemIdx}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 line-clamp-1 text-slate-700">
                    <strong className="text-slate-900">{i.qty}×</strong> {i.name}
                    {i.variant ? ` · ${i.variant}` : ""}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                    {format(i.price * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-bold text-slate-900">Total a pagar</span>
              <span className="font-display text-lg font-extrabold text-slate-900 tabular-nums">
                {format(placedOrder.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {placedOrder.paymentMethod} · feito em {orderDate}
            </p>
          </div>

          {/* Pedido registado (sem link do provedor): dois botões — falar com o
              agente de compra (WhatsApp já com o pedido escrito) e continuar a
              comprar. Com link do provedor, a ação principal é pagar JÁ (o
              redirecionamento automático pode ser bloqueado pelo browser). */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {providerLink ? (
              <>
                <Button href={placedOrder.checkoutUrl} size="lg">
                  Pagar agora
                </Button>
                <Button
                  href={whatsappHref(supplierMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                  size="lg"
                >
                  Falar com o agente de compra
                </Button>
              </>
            ) : placedOrder.checkoutUrl ? (
              <>
                <Button href={placedOrder.checkoutUrl} size="lg">
                  Abrir página de pagamento
                </Button>
                <Button
                  href={whatsappHref(supplierMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                  size="lg"
                >
                  Falar com o agente de compra
                </Button>
              </>
            ) : (
              <>
                <Button
                  href={whatsappHref(supplierMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="lg"
                >
                  Falar com o agente de compra
                </Button>
                <Button href="/" variant="outline" size="lg">
                  Continuar a comprar
                </Button>
              </>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">
            Guardámos o seu pedido — pode acompanhá-lo em{" "}
            <Link
              href={`/pedido/${placedOrder.id}${placedOrder.address.email ? `?email=${encodeURIComponent(placedOrder.address.email)}` : ""}`}
              className="font-semibold text-primary-600 underline underline-offset-2"
            >
              Acompanhar pedido
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  /* ── Formulário ──────────────────────────────────────────── */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (placing) return;
    if (!selectedMethodAvailable) {
      notify("Escolha um método de pagamento disponível.", "info");
      return;
    }
    // O email é a prova de contacto do convidado: é para ele que vai a
    // confirmação e o link de acompanhamento do pedido.
    if (!form.email.trim()) {
      notify("Indique o seu email para receber a confirmação e acompanhar o pedido.", "info");
      return;
    }
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
      setPlacedOrder(order);
      notify("Pedido registado com sucesso ✅");
      // Com link do provedor, o ecrã mostra 3 s de processamento e abre-o; sem
      // link (gateway sem URL) fica o pedido registado e o admin é avisado por
      // email para colar o link no painel.
      setRedirectSeconds(isProviderPaymentLink(order.checkoutUrl) ? 3 : null);
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
    // O endereço acabado de guardar é o que a encomenda passa a usar — e os
    // dados do formulário são substituídos (não só preenchidos se estiverem
    // vazios, senão trocar de endereço mantinha a morada antiga).
    chooseAddress(entry);
    notify("Endereço guardado ✅");
  };

  /** Passa a usar um endereço do livro neste checkout. */
  const chooseAddress = (entry: AddressBookEntry) => {
    setSelectedAddressId(entry.id);
    setSavedAddress(entry);
    setForm((f) => ({
      ...f,
      fullName: entry.fullName,
      phone: entry.phone,
      address: entry.address,
      city: entry.city,
    }));
    setProvince(entry.province || province);
    setAddrModalOpen(false);
  };

  /** Remove um endereço do livro e, se era o escolhido, passa ao seguinte. */
  const removeAddress = (entry: AddressBookEntry) => {
    const next = addressList.filter((a) => a.id !== entry.id);
    setAddressList(next);
    try {
      window.localStorage.setItem("nsm:addresses", JSON.stringify(next));
      void saveMyAddresses(next);
    } catch {
      /* armazenamento indisponível */
    }
    if (entry.id !== selectedAddressId) return;
    const fallback = next.find((a) => a.isDefault) ?? next[0] ?? null;
    setSelectedAddressId(fallback?.id ?? null);
    if (fallback) {
      setForm((f) => ({
        ...f,
        fullName: fallback.fullName,
        phone: fallback.phone,
        address: fallback.address,
        city: fallback.city,
      }));
      setProvince(fallback.province || province);
    }
  };

  return (
    <div className="container-nsm py-6 pb-28">
      <form onSubmit={submit} className="mt-6 px-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Contacto — o email é a prova de contacto do convidado: é para ele
              que vai a confirmação e o link de acompanhamento do pedido. */}
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Mail className="size-5 text-primary-600" /> Contacto
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enviamos a confirmação e o link de acompanhamento para este email.
            </p>
            <div className="mt-3">
              <Input
                label="Email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="nome@email.com"
                leadingIcon={<Mail className="size-4" />}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>

          {/* Dados de entrega — o endereço escolhido aparece gravado; o botão
              tracejado abre o gestor (modal) para escolher ou adicionar outro. */}
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">Endereços de Entrega</h3>

            {selectedAddress ? (
              <div className="relative mt-3 rounded-xl border border-slate-200 bg-surface p-4">
                <span className="absolute right-3 top-3 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                  {selectedAddress.isDefault ? "PADRÃO" : "SELECIONADO"}
                </span>
                <p className="font-bold text-slate-900">{selectedAddress.label}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedAddress.fullName} · {selectedAddress.phone}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {selectedAddress.address}, {selectedAddress.city} — {selectedAddress.province}
                </p>
                {selectedAddress.coords && (
                  <a
                    href={`https://www.google.com/maps?q=${selectedAddress.coords.lat},${selectedAddress.coords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-primary-700 transition hover:underline"
                  >
                    <MapPin className="size-3" aria-hidden />
                    {selectedAddress.coords.lat.toFixed(6)}, {selectedAddress.coords.lng.toFixed(6)}
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
              <Plus className="size-4" aria-hidden />
              {addressList.length > 0 ? "Escolher ou adicionar endereço" : "Adicionar novo endereço"}
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
            {/* O cliente só SELECIONA o método. Ao comprar, abrimos a página do
                provedor, que recolhe os dados e confirma o pagamento. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {paymentMethods.map((m) => {
                const logo = methodLogos[m.id];
                const active = method === m.id;
                // Disponibilidade efetiva: o campo `available` estático E o que o
                // backend diz (métodos desligados sem gateway). Enquanto a lista
                // do backend não chegou, assume-se disponível.
                const backendUnavailable = availabilityLoaded && !methodAvailability.has(m.name);
                const isAvailable = m.available && !backendUnavailable;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!isAvailable}
                    title={isAvailable ? m.name : `${m.name} — indisponível neste momento`}
                    onClick={() => pickMethod(m.id)}
                    aria-pressed={active}
                    className={cn(
                      // Fundo da marca: M-Pesa branco, e-Mola amarelo, cartão branco.
                      "relative flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 px-3 transition active:scale-[0.98]",
                      methodBg[m.id] ?? "bg-white",
                      active
                        ? "border-primary-600 ring-2 ring-primary-600/20"
                        : isAvailable
                          ? "border-slate-200 hover:border-slate-300"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60",
                    )}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo.src} alt={logo.alt} className="max-h-16 w-auto rounded-lg object-contain" />
                    ) : (
                      <span className="text-left text-sm font-semibold text-slate-800">{m.name}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {availabilityLoaded && !onlinePaymentsAvailable && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
                Os pagamentos estão temporariamente indisponíveis. Tente novamente dentro
                de instantes ou fale com o suporte.
              </p>
            )}

            <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Pagamento seguro · ao comprar abrimos a página do provedor, onde conclui
                com o método escolhido.
              </span>
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
            disabled={items.length === 0 || !selectedMethodAvailable}
          >
            {placing ? "A processar…" : "Comprar"}
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
                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => chooseAddress(a)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      a.id === selectedAddress?.id
                        ? "text-emerald-700"
                        : "text-primary-700 transition hover:underline",
                    )}
                  >
                    {a.id === selectedAddress?.id ? (
                      <>
                        <Check className="size-3.5" aria-hidden /> Em uso
                      </>
                    ) : (
                      "Usar este endereço"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAddress(a)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Remover
                  </button>
                </div>
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
