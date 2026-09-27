"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePlus,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FolderOpen,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SalesStatsPanel } from "@/components/admin/SalesStatsPanel";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { API_BASE, apiGet, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { formatDate, groupByISOWeek, type WeekGroup } from "@/lib/format";
import { useCurrency } from "@/context/CurrencyContext";
import { useAsyncData } from "@/lib/hooks";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  advanceOrderStatus,
  cancelOrder,
  fetchSalesStats,
  listAdminOrders,
  type AdminOrdersPage,
  type SalesStats,
} from "@/lib/orders";
import {
  createProduct,
  deleteProduct,
  listAdminProducts,
  updateProduct,
  type CreateProductPayload,
} from "@/lib/products";
import { createCoupon, deleteCoupon, listCoupons } from "@/lib/coupons";
import type { Coupon, Order, OrderStatus, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Timeline dos 6 estados — ordem usada para avançar pedidos. "Cancelado" fica
 * FORA desta lista: é um estado terminal, não um passo da sequência (senão um
 * pedido entregue poderia ser "avançado" para cancelado).
 */
const ORDER_STATUSES: OrderStatus[] = [
  "Pedido recebido",
  "Pagamento confirmado",
  "Em preparação",
  "Enviado",
  "Em trânsito",
  "Entregue",
];

/** Filtros do painel — timeline + o estado terminal de cancelamento. */
const ORDER_FILTERS: OrderStatus[] = [...ORDER_STATUSES, "Cancelado"];

/** Página vazia — antes do primeiro carregamento e nas mutações locais. */
const EMPTY_ORDERS_PAGE: AdminOrdersPage = {
  items: [],
  page: 0,
  size: ADMIN_ORDERS_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
  hasNext: false,
  statusCounts: {},
};


const STATUS_STYLES: Record<OrderStatus, string> = {
  "Pedido recebido": "bg-sky-50 text-sky-700",
  "Pagamento confirmado": "bg-indigo-50 text-indigo-700",
  "Em preparação": "bg-amber-50 text-amber-700",
  Enviado: "bg-violet-50 text-violet-700",
  "Em trânsito": "bg-blue-50 text-blue-700",
  Entregue: "bg-emerald-50 text-emerald-700",
  Cancelado: "bg-red-50 text-red-700",
};

function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function OrderSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="h-5 w-28 animate-pulse rounded-full bg-slate-200/80" />
      </div>
      <div className="mt-4 h-3 w-2/3 animate-pulse rounded-lg bg-slate-200/80" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded-lg bg-slate-200/80" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-6 w-24 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="h-9 w-36 animate-pulse rounded-xl bg-slate-200/80" />
      </div>
    </div>
  );
}

/** Skeleton de linha (produtos do catálogo / subscritores da newsletter). */
function ProductSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-surface p-4">
      <div className="size-14 shrink-0 animate-pulse rounded-xl bg-slate-200/80" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/5 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="h-3 w-1/4 animate-pulse rounded-lg bg-slate-200/60" />
      </div>
      <div className="h-8 w-40 animate-pulse rounded-xl bg-slate-200/70" />
    </div>
  );
}

const BADGE_OPTIONS = ["NOVO", "OFERTA", "MAIS VENDIDO"] as const;

/* ── Rascunhos de especificações e variantes (formulário de produto) ── */

type SpecDraft = { label: string; value: string };
type OptionDraft = { name: string; hex: string };
type VariantDraft = { type: "Cor" | "Tamanho"; options: OptionDraft[] };

const VARIANT_TYPES = ["Cor", "Tamanho"] as const;

export default function AdminPage() {
  const router = useRouter();
  const { format } = useCurrency();
  // Sessão — vem do contexto de autenticação principal (o único login da loja).
  const { user, initializing, logout: authLogout } = useAuth();
  const { openLogin } = useLoginModal();

  // Secção ativa do painel: pedidos, publicar produto, gerir catálogo, newsletter,
  // cupões ou estatísticas.
  const [section, setSection] = useState<
    "pedidos" | "produtos" | "gerir" | "newsletter" | "cupoes" | "estatisticas"
  >("pedidos");

  // Estatísticas de vendas (agregadas no servidor). Carregam-se à entrada da
  // secção e ficam em cache local enquanto o admin navega entre secções.
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Produto cujos detalhes estão abertos (modal) e produto recém-publicado
  // (destacado no topo da lista de gestão).
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Pedidos
  // Sem filtro "Todos" — cada filtro por estado mostra as pastas semanais dessa vista.
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  // Página da listagem (base 0). A lista é paginada NO SERVIDOR: antes vinha o
  // histórico todo, com os itens de cada pedido.
  const [ordersPage, setOrdersPage] = useState(0);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Pasta semanal aberta na vista "Todos" (null = mostra as pastas).
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  // Chave da pasta com avanço em massa em curso (botão desabilitado).
  const [advancingWeek, setAdvancingWeek] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Categorias para o formulário de produto (fallback vazio enquanto carrega).
  const { data: categories } = useAsyncData(
    () => fetch("/api/categories").then((r) => r.json()).then((j) => j.data as { slug: string; name: string; emoji?: string }[]),
    [],
  );

  // Formulário de novo produto
  const emptyForm = {
    name: "",
    brand: "",
    category: "",
    price: "",
    oldPrice: "",
    stock: "10",
    shortDescription: "",
    description: "",
    images: "",
    tags: "",
    badges: [] as string[],
    specs: [] as SpecDraft[],
    variants: [] as VariantDraft[],
    deliveryDays: "3–7",
    freeShipping: false,
    featured: false,
    bestseller: false,
    isNew: true,
    dealOfDay: false,
  };

  // Especificações (label/valor) — lista dinâmica.
  const addSpec = () => setForm((f) => ({ ...f, specs: [...f.specs, { label: "", value: "" }] }));
  const updateSpec = (i: number, key: "label" | "value", value: string) =>
    setForm((f) => ({
      ...f,
      specs: f.specs.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)),
    }));
  const removeSpec = (i: number) =>
    setForm((f) => ({ ...f, specs: f.specs.filter((_, idx) => idx !== i) }));

  // Variantes (Cor/Tamanho com opções) — lista dinâmica.
  const addVariant = () =>
    setForm((f) => ({ ...f, variants: [...f.variants, { type: "Cor", options: [{ name: "", hex: "" }] }] }));
  const updateVariantType = (i: number, type: string) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) => (idx === i ? { ...v, type: type as VariantDraft["type"] } : v)),
    }));
  const removeVariant = (i: number) =>
    setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
  const addOption = (vi: number) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) =>
        idx === vi ? { ...v, options: [...v.options, { name: "", hex: "" }] } : v,
      ),
    }));
  const updateOption = (vi: number, oi: number, key: "name" | "hex", value: string) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) =>
        idx === vi
          ? { ...v, options: v.options.map((o, oidx) => (oidx === oi ? { ...o, [key]: value } : o)) }
          : v,
      ),
    }));
  const removeOption = (vi: number, oi: number) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) =>
        idx === vi ? { ...v, options: v.options.filter((_, oidx) => oidx !== oi) } : v,
      ),
    }));
  const [form, setForm] = useState(emptyForm);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Modo edição: id do produto a editar (null → criar novo).
  // Guardamos também o slug atual para o caso de o nome mudar (o backend regenera).
  const [editing, setEditing] = useState<{ id: string; slug: string } | null>(null);

  const setField = (key: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleBadge = (b: string) =>
    setForm((f) => ({
      ...f,
      badges: f.badges.includes(b) ? f.badges.filter((x) => x !== b) : [...f.badges, b],
    }));

  // Imagens do produto: lista derivada do campo `images` (URLs separadas por vírgula).
  const imageUrls = useMemo(
    () => form.images.split(",").map((s) => s.trim()).filter(Boolean),
    [form.images],
  );

  const addImageUrls = (urls: string[]) => {
    if (urls.length === 0) return;
    setForm((f) => ({ ...f, images: [...imageUrls, ...urls].join(", ") }));
  };

  const removeImage = (url: string) => {
    setForm((f) => ({ ...f, images: imageUrls.filter((u) => u !== url).join(", ") }));
  };

  /** A primeira imagem é a capa — move a escolhida para a frente da lista. */
  const setCover = (url: string) => {
    setForm((f) => ({ ...f, images: [url, ...imageUrls.filter((u) => u !== url)].join(", ") }));
  };

  /** Envia as imagens selecionadas para o backend e adiciona as URLs ao produto.
   *  Autenticação via cookies HttpOnly (credentials: "include") — sem header Authorization. */
  const uploadImages = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploadingImages(true);
    setImageError(null);
    const uploaded: string[] = [];
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
        }
        const { data } = (await res.json()) as { data: { url: string } };
        uploaded.push(data.url);
      }
      addImageUrls(uploaded);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setImageError(err instanceof Error ? err.message : "Não foi possível carregar a imagem.");
    } finally {
      setUploadingImages(false);
    }
  };

  /** Preenche o formulário com um produto existente e entra em modo edição. */
  const startEdit = (p: Product) => {
    setEditing({ id: p.id, slug: p.slug });
    setForm({
      name: p.name,
      brand: p.brand ?? "",
      category: p.category,
      price: String(p.price),
      oldPrice: p.oldPrice ? String(p.oldPrice) : "",
      stock: String(p.stock),
      shortDescription: p.shortDescription,
      description: (p.description ?? []).join("\n"),
      images: (p.images ?? []).join(", "),
      tags: (p.tags ?? []).join(", "),
      badges: (p.badges ?? []).filter((b) => (BADGE_OPTIONS as readonly string[]).includes(b)) as string[],
      specs: (p.specs ?? []).map((s) => ({ label: s.label, value: s.value })),
      variants: (p.variants ?? []).map((v) => ({
        type: v.type === "Tamanho" ? "Tamanho" : "Cor",
        options: (v.options ?? []).map((o) => ({ name: o.name, hex: o.hex ?? "" })),
      })),
      deliveryDays: `${p.deliveryDays?.[0] ?? 3}–${p.deliveryDays?.[1] ?? 7}`,
      freeShipping: Boolean(p.freeShipping),
      featured: Boolean(p.featured),
      bestseller: Boolean(p.bestseller),
      isNew: Boolean(p.isNew),
      dealOfDay: Boolean(p.dealOfDay),
    });
    setPublishMsg(null);
    setSection("produtos");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
    setPublishMsg(null);
  };

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setPublishMsg(null);
    try {
      const [minDays, maxDays] = form.deliveryDays.split("–").map((s) => parseInt(s.trim(), 10));
      const payload: CreateProductPayload = {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        category: form.category,
        price: Number(form.price),
        oldPrice: form.oldPrice ? Number(form.oldPrice) : undefined,
        stock: Math.max(0, parseInt(form.stock, 10) || 0),
        shortDescription: form.shortDescription.trim(),
        description: form.description
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        images: form.images
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: form.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        badges: form.badges,
        specs: form.specs
          .filter((s) => s.label.trim() && s.value.trim())
          .map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
        variants: form.variants
          .filter((v) => v.options.some((o) => o.name.trim()))
          .map((v) => ({
            type: v.type,
            options: v.options
              .filter((o) => o.name.trim())
              .map((o) => ({ name: o.name.trim(), hex: o.hex.trim() || undefined })),
          })),
        deliveryDays: [minDays || 3, maxDays || 7],
        freeShipping: form.freeShipping,
        featured: form.featured,
        bestseller: form.bestseller,
        isNew: form.isNew,
        dealOfDay: form.dealOfDay,
      };
      if (editing) {
        await updateProduct(editing.id, payload);
        setPublishMsg({
          ok: true,
          text: "Produto atualizado com sucesso! As alterações já estão visíveis na loja.",
        });
      } else {
        const created = await createProduct(payload);
        setPublishMsg({
          ok: true,
          text: `Produto “${created.name}” publicado! Está no topo do catálogo, em “Gerir catálogo”.`,
        });
        setForm(emptyForm);
        setEditing(null);
        // Leva o admin a "Gerir catálogo" com o produto novo no topo da lista
        // (a lista vem do servidor a seguir, para não ficar desatualizada) e
        // revalida o resto da página.
        openCatalogWith(created);
        void refreshCatalogTop(created);
        return;
      }
      setForm(emptyForm);
      setEditing(null);
      // Recarrega a lista de produtos do painel (criação/edição mudou o catálogo).
      void reloadProducts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setPublishMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Não foi possível publicar o produto.",
      });
    } finally {
      setPublishing(false);
    }
  };

  /** Elimina um produto do catálogo (com confirmação). */
  const removeProduct = async (p: Product) => {
    if (!window.confirm(`Eliminar "${p.name}" do catálogo? Esta ação não pode ser revertida.`)) return;
    try {
      await deleteProduct(p.id);
      setProducts((prev) => (prev ?? []).filter((x) => x.id !== p.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      window.alert(
        `Não foi possível eliminar o produto:\n${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  };

  /**
   * Sessão expirada (401) ou "Sair" → termina a sessão principal (token + perfil)
   * e volta à página inicial. Não limpa `orders` diretamente: o useAsyncData
   * re-executa quando o user fica null e esvazia a lista.
   */
  const logout = () => {
    authLogout();
    setStatusFilter("");
    router.push("/");
  };

  /**
   * Carrega as estatísticas de vendas (todos os totais são agregados no SQL do
   * backend — o cliente recebe só os números). Sem cache e sem dados locais: um
   * painel de gestão não pode mostrar números inventados.
   */
  const loadStats = async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await fetchSalesStats());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout();
          return;
        }
        setStatsError(
          err.status === 403
            ? "A sua conta não tem permissões de administrador."
            : err.message,
        );
        return;
      }
      setStatsError("Não foi possível carregar as estatísticas. Verifique a ligação e tente novamente.");
    } finally {
      setStatsLoading(false);
    }
  };

  // Carrega uma vez, à entrada da secção "Estatísticas". O botão "Tentar
  // novamente" do painel recarrega explicitamente (loadStats).
  const statsRequestedRef = useRef(false);
  useEffect(() => {
    if (section !== "estatisticas" || statsRequestedRef.current) return;
    statsRequestedRef.current = true;
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Carrega a página sempre que o utilizador, o filtro ou a página mudam (via
  // useAsyncData, que adia o setState para não disparar atualizações síncronas
  // no effect). 401 → sessão expirada: o catch do fetcher (promise, fora do
  // effect) faz logout().
  const {
    data: ordersResult,
    loading,
    error: loadError,
    setData: setOrdersResult,
  } = useAsyncData<AdminOrdersPage | null>(
    () =>
      user
        ? listAdminOrders(statusFilter, ordersPage, ADMIN_ORDERS_PAGE_SIZE).catch((err) => {
            if (err instanceof ApiError && err.status === 401) logout();
            throw err;
          })
        : Promise.resolve(null),
    [user, statusFilter, ordersPage],
  );

  /**
   * Pedidos da página atual (lista vazia enquanto carrega a primeira vez).
   * Num `useMemo` próprio: a criar um array novo em cada render, invalidava as
   * memoizações que dele dependem (pastas semanais, contadores).
   */
  const orders = useMemo(() => ordersResult?.items ?? [], [ordersResult]);

  /**
   * Atualiza a lista da página atual sem perder os metadados da página (totais,
   * contagens por estado) — as ações locais (avançar/cancelar) só mexem nos itens.
   */
  const setOrders = (update: Order[] | ((previous: Order[]) => Order[])) => {
    setOrdersResult((previous) => {
      const base = previous ?? EMPTY_ORDERS_PAGE;
      const items = typeof update === "function" ? update(base.items) : update;
      return { ...base, items };
    });
  };

  /** Muda de página e fecha a pasta aberta (as semanas da página mudam). */
  const goToPage = (next: number) => {
    setOpenWeek(null);
    setOrdersPage(Math.max(0, next));
  };

  // Catálogo para a secção "Gerir produtos" (só carrega com sessão de admin).
  const { data: products, loading: productsLoading, setData: setProducts } = useAsyncData(
    () =>
      user
        ? listAdminProducts().catch((err) => {
            if (err instanceof ApiError && err.status === 401) logout();
            throw err;
          })
        : Promise.resolve([] as Product[]),
    [user],
  );

  /**
   * Depois de publicar: abre "Gerir catálogo" com o produto novo destacado no
   * topo, para o admin confirmar o que acabou de ficar visível na loja.
   */
  const openCatalogWith = (p: Product) => {
    setSection("gerir");
    setHighlightId(p.id);
    setProducts([p, ...(products ?? []).filter((x) => x.id !== p.id)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // O destaque desaparece sozinho — não deve confundir uma visita seguinte.
    window.setTimeout(() => setHighlightId((cur) => (cur === p.id ? null : cur)), 12_000);
  };

  /**
   * Confirma o topo da lista com o servidor (a lista local pode estar stale) e
   * revalida a página — mantendo sempre o produto recém-publicado em primeiro.
   */
  const refreshCatalogTop = async (p: Product) => {
    try {
      const list = await listAdminProducts();
      setProducts([p, ...list.filter((x) => x.id !== p.id)]);
    } catch {
      /* a lista local já mostra o produto publicado */
    }
    router.refresh();
  };

  /** Recarga silenciosa da lista de produtos (após criar/editar/eliminar). */
  const reloadProducts = async () => {
    try {
      setProducts(await listAdminProducts());
    } catch {
      /* a lista antiga permanece — o erro já é tratado no useAsyncData */
    }
  };

  // Cupões promocionais (GET /api/admin/coupons — apenas admin).
  const { data: coupons, loading: couponsLoading, setData: setCoupons } = useAsyncData(
    () =>
      user
        ? listCoupons().catch((err) => {
            if (err instanceof ApiError && err.status === 401) logout();
            throw err;
          })
        : Promise.resolve([] as Coupon[]),
    [user],
  );

  // Formulário de criação de cupão.
  const [couponForm, setCouponForm] = useState({
    code: "",
    discountType: "PERCENT",
    discountValue: "",
    minimumSubtotal: "",
    usageLimit: "",
    expiresAt: "",
  });
  const [couponBusy, setCouponBusy] = useState(false);

  const submitCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (couponBusy) return;
    const value = Number(couponForm.discountValue);
    if (!couponForm.code.trim() || !Number.isFinite(value) || value <= 0) {
      window.alert("Indique um código e um valor de desconto maior que zero.");
      return;
    }
    setCouponBusy(true);
    try {
      const created = await createCoupon({
        code: couponForm.code.trim().toUpperCase(),
        discountType: couponForm.discountType as "PERCENT" | "FIXED",
        discountValue: value,
        minimumSubtotal: couponForm.minimumSubtotal
          ? Number(couponForm.minimumSubtotal)
          : undefined,
        usageLimit: couponForm.usageLimit ? Number(couponForm.usageLimit) : undefined,
        expiresAt: couponForm.expiresAt
          ? new Date(couponForm.expiresAt).toISOString()
          : undefined,
        active: true,
      });
      setCoupons((prev) => [created, ...(prev ?? [])]);
      setCouponForm({
        code: "",
        discountType: "PERCENT",
        discountValue: "",
        minimumSubtotal: "",
        usageLimit: "",
        expiresAt: "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar o cupão.";
      window.alert(`Não foi possível criar o cupão:\n${msg}`);
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = async (coupon: Coupon) => {
    if (!coupon.id || !window.confirm(`Remover o cupão ${coupon.code}?`)) return;
    try {
      await deleteCoupon(coupon.id);
      setCoupons((prev) => (prev ?? []).filter((c) => c.id !== coupon.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao remover o cupão.";
      window.alert(`Não foi possível remover o cupão:\n${msg}`);
    }
  };

  // Subscritores da newsletter (GET /api/newsletter/subscribers — apenas admin).
  const { data: subscribers, loading: subscribersLoading } = useAsyncData(
    () =>
      user
        ? apiGet<
            { data: { id: number; email: string; name?: string; subscribedAt: string; active: boolean }[] }
          >("/api/newsletter/subscribers", 0, true).then((j) => j.data ?? [])
        : Promise.resolve([]),
    [user],
  );

  /** Duração mínima da rotação do ícone — para a animação ser notada mesmo em recargas rápidas. */
  const MIN_SPIN_MS = 600;

  /** Recarga manual (botão Atualizar / Tentar novamente) — roda o ícone enquanto carrega. */
  const reload = async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      setOrdersResult(await listAdminOrders(statusFilter, ordersPage, ADMIN_ORDERS_PAGE_SIZE));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
    } finally {
      // Garante pelo menos MIN_SPIN_MS de rotação antes de parar a animação.
      const elapsed = Date.now() - started;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
      }
      setRefreshing(false);
    }
  };

  const advance = async (order: Order) => {
    const index = ORDER_STATUSES.indexOf(order.status);
    if (index < 0 || index >= ORDER_STATUSES.length - 1) return;
    const next = ORDER_STATUSES[index + 1];
    setAdvancingId(order.id);
    try {
      const updated = await advanceOrderStatus(order.id, next);
      // Atualiza localmente com a resposta do servidor — sem depender de um reload
      // (evita lista stale e erros engolidos), mantendo a ordenação por data desc.
      setOrders((prev) =>
        (prev ?? [])
          .map((o) => (o.id === updated.id ? updated : o))
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      const msg = err instanceof Error ? err.message : "Erro ao atualizar o estado.";
      window.alert(`Não foi possível avançar o pedido ${order.id}:\n${msg}`);
    } finally {
      setAdvancingId(null);
    }
  };

  /**
   * Cancela um pedido (admin) — o servidor repõe o stock e envia o email.
   * O estado terminal atualiza-se na lista sem recarregar.
   */
  const cancel = async (order: Order) => {
    if (
      !window.confirm(
        `Cancelar o pedido ${order.id}? O stock será reposto e o cliente será notificado.`,
      )
    ) {
      return;
    }
    setCancellingId(order.id);
    try {
      const updated = await cancelOrder(order.id);
      setOrders((prev) => (prev ?? []).map((o) => (o.id === updated.id ? updated : o)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      const msg = err instanceof Error ? err.message : "Erro ao cancelar o pedido.";
      window.alert(`Não foi possível cancelar o pedido ${order.id}:\n${msg}`);
    } finally {
      setCancellingId(null);
    }
  };

  /**
   * Avança a pasta semanal inteira um estado para a frente: todos os pedidos
   * em curso recebem o MESMO estado de destino — o estado seguinte ao mais
   * avançado da pasta. Clicando repetidamente a pasta percorre
   * "Pagamento confirmado" → "Em preparação" → "Enviado" → "Em trânsito" →
   * "Entregue". Pedidos já entregues ficam de fora.
   */
  const advanceAllWeek = async (group: WeekGroup<Order>) => {
    const pending = group.items.filter(
      (o) => ORDER_STATUSES.indexOf(o.status) < ORDER_STATUSES.length - 1,
    );
    if (pending.length === 0) return;
    // Estado mais avançado da pasta → destino comum = seguinte.
    const maxIndex = Math.max(
      ...pending.map((o) => ORDER_STATUSES.indexOf(o.status)),
    );
    const target = ORDER_STATUSES[Math.min(maxIndex + 1, ORDER_STATUSES.length - 1)];
    const ok = window.confirm(
      `Semana ${group.week}: avançar ${pending.length} pedido${pending.length === 1 ? "" : "s"} para o estado «${target}»?`,
    );
    if (!ok) return;
    setAdvancingWeek(group.key);
    let failures = 0;
    for (const o of pending) {
      try {
        const updated = await advanceOrderStatus(o.id, target);
        setOrders((prev) =>
          (prev ?? []).map((x) => (x.id === updated.id ? updated : x)),
        );
      } catch {
        failures++;
      }
    }
    setAdvancingWeek(null);
    if (failures > 0) {
      window.alert(
        `${pending.length - failures} pedido(s) avançado(s); ${failures} falharam (erro de rede ou sessão expirada).`,
      );
    }
  };

  /**
   * Gera o HTML de um recibo (documento de impressão) para uma lista de
   * pedidos: cliente, contacto, morada, artigos, pagamento e totais + resumo
   * financeiro. Serve tanto o recibo de UM pedido como o da pasta semanal.
   */
  const buildReceiptHtml = (items: Order[], title: string, subtitle: string) => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const money = (v: number) =>
      `${Math.round(v).toLocaleString("pt-MZ").replace(/\s/g, ".")} MT`;
    const grandTotal = items.reduce((sum, o) => sum + o.total, 0);
    const totalShipping = items.reduce((sum, o) => sum + o.shipping, 0);

    const orderRows = items
      .map(
        (o) => `
      <div class="order">
        <div class="order-head">
          <div>
            <strong>${esc(o.id)}</strong>
            <span class="pill">${esc(o.status)}</span>
            <span class="date">${formatDate(o.date)}</span>
          </div>
          <div class="total">${money(o.total)}</div>
        </div>
        <table>
          <tr>
            <th>Cliente</th>
            <td>${esc(o.address.fullName)} · ${esc(o.address.phone)}</td>
          </tr>
          <tr>
            <th>Morada</th>
            <td>${esc(o.address.address)}, ${esc(o.address.city)} — ${esc(o.address.province)}</td>
          </tr>
          <tr>
            <th>Pagamento</th>
            <td>${esc(o.paymentMethod)}${o.paymentReference ? ` · Ref. ${esc(o.paymentReference)}` : ""}</td>
          </tr>
        </table>
        <table class="items">
          <thead>
            <tr><th>Artigo</th><th>Qtd.</th><th>Preço</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            ${o.items
              .map(
                (i) => `<tr>
              <td>${esc(i.name)}${i.variant ? ` · ${esc(i.variant)}` : ""}</td>
              <td>${i.qty}</td>
              <td>${money(i.price)}</td>
              <td>${money(i.price * i.qty)}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>${title} · NorteShopMoz</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 13px/1.5 "Segoe UI", Arial, sans-serif; color: #0f172a; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 18px; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .summary div { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 12px; }
  .summary b { display: block; font-size: 16px; margin-top: 2px; }
  .order { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
  .order-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
  .pill { background: #ecfdf5; color: #047857; border-radius: 99px; padding: 1px 8px; font-size: 11px; font-weight: 700; margin-left: 6px; }
  .date { color: #64748b; font-size: 11px; margin-left: 6px; }
  .total { font-weight: 700; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
  th { text-align: left; width: 90px; color: #64748b; font-weight: 600; padding: 2px 6px 2px 0; vertical-align: top; }
  td { padding: 2px 0; }
  .items th { width: auto; border-bottom: 1px solid #e2e8f0; padding: 4px 6px; }
  .items td { border-bottom: 1px solid #f1f5f9; padding: 4px 6px; }
  .items th:last-child, .items td:last-child { text-align: right; }
  .items th:nth-child(2), .items td:nth-child(2) { text-align: center; }
  .foot { margin-top: 16px; text-align: center; color: #64748b; font-size: 11px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="sub">${subtitle} · ${items.length} pedido(s) · Emitido em ${new Date().toLocaleString("pt-MZ")}</p>
  <div class="summary">
    <div>Pedidos<b>${items.length}</b></div>
    <div>Artigos<b>${items.reduce((n, o) => n + o.items.length, 0)}</b></div>
    <div>Envios<b>${money(totalShipping)}</b></div>
    <div>Total da semana<b>${money(grandTotal)}</b></div>
  </div>
  ${orderRows}
  <p class="foot">NorteShopMoz — Compras simples, seguras e acessíveis em Moçambique · Documento gerado automaticamente pelo painel de administração.</p>
</body>
</html>`;

    return html;
  };

  /** Abre a janela de impressão do browser com um documento HTML já gerado. */
  const openPrintWindow = (html: string) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      window.alert("Não foi possível abrir a janela de impressão — verifique o bloqueador de pop-ups.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  /**
   * Recibo da pasta semanal — todos os pedidos da semana num único documento.
   */
  const printWeekReceipt = (group: WeekGroup<Order>) => {
    openPrintWindow(
      buildReceiptHtml(
        group.items,
        `NorteShopMoz — Recibo da Semana ${group.week}`,
        `${weekRangeLabel(group)} · Semana ${group.week} de ${group.year}`,
      ),
    );
  };

  /**
   * Recibo de UM pedido — o mesmo documento, para imprimir/entregar logo que o
   * pagamento é confirmado (ou em qualquer estado seguinte).
   */
  const printOrderReceipt = (order: Order) => {
    openPrintWindow(
      buildReceiptHtml(
        [order],
        `NorteShopMoz — Recibo do pedido ${order.id}`,
        `${formatDate(order.date)} · ${order.status}`,
      ),
    );
  };

  // Totais por estado vindos do servidor. NÃO podem ser contados sobre a lista
  // carregada: com paginação seriam apenas os da página atual.
  const counts = useMemo(() => {
    const map = new Map<OrderStatus, number>();
    for (const s of ORDER_FILTERS) map.set(s, ordersResult?.statusCounts?.[s] ?? 0);
    return map;
  }, [ordersResult]);

  /** Pastas semanais (ISO, segunda→domingo), mais recente primeiro. */
  const weekGroups = useMemo(
    () => groupByISOWeek<Order>(orders ?? [], (o) => o.date),
    [orders],
  );

  /** Fábrica de grupos semanais a partir de uma lista qualquer de pedidos. */
  const groupOrders = (list: Order[]) => groupByISOWeek<Order>(list, (o) => o.date);

  /** Formata o intervalo de datas de uma pasta semanal, ex.: "31 ago – 6 set 2026". */
  const weekRangeLabel = (g: WeekGroup<Order>) => {
    const fmt = (d: Date) =>
      d.toLocaleDateString("pt-MZ", { day: "2-digit", month: "short" });
    const year = g.start.toLocaleDateString("pt-MZ", { year: "numeric" });
    const sameMonth = g.months.length === 1;
    const endFmt = sameMonth
      ? g.end.toLocaleDateString("pt-MZ", { day: "2-digit" })
      : fmt(g.end);
    return `${fmt(g.start)} – ${endFmt} ${year}`;
  };

  /** Pasta semanal actualmente aberta (ou null se fechada). */
  const openGroup = useMemo(
    () => weekGroups.find((g) => g.key === openWeek) ?? null,
    [weekGroups, openWeek],
  );

  /** Cartão de pedido individual — usado na pasta aberta e nos filtros por estado. */
  const renderOrderCard = (o: Order) => {
    const index = ORDER_STATUSES.indexOf(o.status);
    const canAdvance = index >= 0 && index < ORDER_STATUSES.length - 1;
    return (
      <div key={o.id} className="rounded-2xl border border-slate-100 bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display font-bold text-slate-900">{o.id}</p>
              <StatusPill status={o.status} />
              {o.items.length > 1 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                  {o.items.length} itens
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {o.address.fullName} · {o.address.phone}
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
              {o.address.address}, {o.address.city} — {o.address.province} ·{" "}
              {o.paymentMethod}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-display text-lg font-bold text-slate-900">
              {format(o.total)}
            </span>
            <span className="text-xs text-slate-400">{formatDate(o.date)}</span>
          </div>
        </div>

        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          {o.items.slice(0, 3).map((i) => (
            <li key={i.productId + (i.variant ?? "")} className="flex justify-between gap-3">
              <Link
                href={`/produto/${i.slug}`}
                className="line-clamp-1 text-slate-600 hover:text-primary-700"
              >
                {i.qty}× {i.name}
                {i.variant ? ` · ${i.variant}` : ""}
              </Link>
              <span className="shrink-0 font-semibold text-slate-700">
                {format(i.price * i.qty)}
              </span>
            </li>
          ))}
          {o.items.length > 3 && (
            <li className="text-xs font-medium text-slate-400">
              + {o.items.length - 3} outro{o.items.length - 3 === 1 ? "" : "s"} artigo
              {o.items.length - 3 === 1 ? "" : "s"}
            </li>
          )}
        </ul>

        {canAdvance ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">
              Próximo estado: <strong className="text-slate-600">{ORDER_STATUSES[index + 1]}</strong>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => printOrderReceipt(o)}>
                <Printer className="size-3.5" /> Imprimir recibo
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={cancellingId === o.id}
                onClick={() => void cancel(o)}
              >
                <XCircle className="size-3.5" /> Cancelar
              </Button>
              <Button
                size="sm"
                loading={advancingId === o.id}
                onClick={() => void advance(o)}
              >
                Avançar estado <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            {o.status === "Cancelado" ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <XCircle className="size-3.5" /> Pedido cancelado
              </span>
            ) : (
              <>
                <span className="mr-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <Package className="size-3.5" /> Pedido concluído
                </span>
                {/* Também num pedido entregue o recibo pode ser reimpresso. */}
                <Button variant="outline" size="sm" onClick={() => printOrderReceipt(o)}>
                  <Printer className="size-3.5" /> Imprimir recibo
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // Sem sessão ou sem privilégios de administrador → nunca mostra um login próprio;
  // usa o login principal da loja (modal). Administradores veem apenas o painel.
  if (initializing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary-600" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container-nsm flex justify-center py-16">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-card">
              <ShieldCheck className="size-7" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
              Área de administração
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Esta área é reservada a administradores. Entre com a sua conta para gerir os pedidos.
            </p>
          </div>
          <Button
            fullWidth
            className="mt-6"
            onClick={() => {
              openLogin();
              router.replace("/");
            }}
          >
            <Lock className="size-4" /> Entrar
          </Button>
        </div>
      </div>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <div className="container-nsm flex justify-center py-16">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 shadow-card">
            <ShieldCheck className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            Sem permissões de administrador
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Esta área é reservada a administradores. A sua conta não tem acesso a este painel.
          </p>
          <Button variant="secondary" fullWidth className="mt-6" href="/">
            Voltar à loja
          </Button>
        </div>
      </div>
    );
  }

  const SECTION_TITLES = {
    pedidos: "Gestão de pedidos",
    estatisticas: "Estatísticas de vendas",
    produtos: editing ? "Editar produto" : "Publicar produto",
    gerir: "Gerir catálogo",
    newsletter: "Newsletter",
    cupoes: "Cupões",
  } as const;
  const SECTION_SUBTITLES = {
    pedidos: `${(orders ?? []).length} pedido${(orders ?? []).length === 1 ? "" : "s"}`,
    estatisticas: stats
      ? `Receita confirmada de ${stats.totalOrders} pedido${stats.totalOrders === 1 ? "" : "s"}`
      : "Resumo agregado das vendas da loja",
    produtos: editing
      ? `A editar “${form.name || "produto"}”`
      : "Publique um novo produto no catálogo",
    gerir: `${(products ?? []).length} produto${(products ?? []).length === 1 ? "" : "s"} no catálogo`,
    newsletter: `${(subscribers ?? []).length} subscritor${(subscribers ?? []).length === 1 ? "" : "es"}`,
    cupoes: `${(coupons ?? []).length} cupão${(coupons ?? []).length === 1 ? "" : "ões"}`,
  } as const;

  return (
    <div className="container-nsm py-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-navy-900 text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-slate-900">
              {SECTION_TITLES[section]}
            </h1>
            <p className="text-sm text-slate-500">{SECTION_SUBTITLES[section]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {section === "pedidos" && (
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={refreshing}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Atualizar
            </Button>
          )}
          {section === "estatisticas" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadStats()}
              disabled={statsLoading}
            >
              <RefreshCw className={cn("size-3.5", statsLoading && "animate-spin")} /> Atualizar
            </Button>
          )}
          {section === "gerir" && (
            <Button variant="outline" size="sm" onClick={() => void reloadProducts()}>
              <RefreshCw className="size-3.5" /> Atualizar
            </Button>
          )}
          {section === "produtos" && editing && (
            <Button variant="outline" size="sm" onClick={cancelEdit}>
              <X className="size-3.5" /> Cancelar edição
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-3.5" /> Sair
          </Button>
        </div>
      </div>

      {/* Navegação do painel */}
      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {([
          { id: "pedidos", label: "Pedidos", icon: ClipboardList },
          { id: "estatisticas", label: "Estatísticas", icon: BarChart3 },
          { id: "produtos", label: editing ? "Editar produto" : "Publicar produto", icon: PackagePlus },
          { id: "gerir", label: "Gerir catálogo", icon: Package },
          { id: "cupoes", label: "Cupões", icon: Tag },
          { id: "newsletter", label: "Newsletter", icon: Users },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={cn(
              "flex shrink-0 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
              section === tab.id
                ? "bg-surface text-navy-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <tab.icon className="size-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Secção: Estatísticas de vendas ───────────────────── */}
      {section === "estatisticas" && (
        <SalesStatsPanel
          stats={stats}
          loading={statsLoading}
          error={statsError}
          onRetry={() => void loadStats()}
        />
      )}

      {/* ─── Secção: Publicar/Editar produto ──────────────────── */}
      {section === "produtos" && (
        <form onSubmit={publish} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {/* Informação básica */}
            <section className="rounded-2xl border border-slate-100 bg-surface p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
                <BadgePlus className="size-5 text-primary-600" /> Informação básica
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Nome do produto"
                  required
                  value={form.name}
                  onChange={setField("name")}
                  placeholder="Ex.: Telemóvel NSM X20 · 256 GB"
                  className="sm:col-span-2"
                />
                <Input
                  label="Marca"
                  value={form.brand}
                  onChange={setField("brand")}
                  placeholder="Ex.: NSM"
                />
                <Select label="Categoria" required value={form.category} onChange={setField("category")}>
                  <option value="" disabled>
                    Selecionar categoria…
                  </option>
                  {(categories ?? []).map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.emoji ? `${c.emoji} ` : ""}{c.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Preço (MT)"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={setField("price")}
                  placeholder="Ex.: 12900"
                />
                <Input
                  label="Preço antigo (MT) — opcional"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.oldPrice}
                  onChange={setField("oldPrice")}
                  placeholder="Ex.: 15900"
                />
                <Input
                  label="Stock"
                  required
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={setField("stock")}
                />
                <Input
                  label="Dias de entrega (min–max)"
                  value={form.deliveryDays}
                  onChange={setField("deliveryDays")}
                  placeholder="Ex.: 3–7"
                />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Selos (badges)</p>
                <div className="flex flex-wrap gap-2">
                  {BADGE_OPTIONS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBadge(b)}
                      aria-pressed={form.badges.includes(b)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
                        form.badges.includes(b)
                          ? "border-brand bg-brand text-white"
                          : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300",
                      )}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Descrição */}
            <section className="rounded-2xl border border-slate-100 bg-surface p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-slate-900">Descrição</h2>
              <div className="mt-4 grid gap-4">
                <Textarea
                  label="Descrição curta (vitrine)"
                  required
                  value={form.shortDescription}
                  onChange={setField("shortDescription")}
                  placeholder="Ex.: Telemóvel com ecrã AMOLED de 6,7 polegadas, 256 GB e câmara de 108 MP."
                  rows={2}
                />
                <Textarea
                  label="Descrição completa (uma linha por parágrafo)"
                  value={form.description}
                  onChange={setField("description")}
                  placeholder="Ex.: Ecrã AMOLED de 6,7 polegadas&#10;Bateria de 5.000 mAh com carregamento rápido&#10;Câmara principal de 108 MP"
                  rows={5}
                />
                <div className="sm:col-span-2">
                  <p className="mb-2 text-sm font-semibold text-slate-700">Imagens do produto</p>
                  <label
                    className={cn(
                      "flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700",
                      uploadingImages && "pointer-events-none opacity-60",
                    )}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadingImages}
                      onChange={(e) => {
                        if (e.target.files?.length) void uploadImages(e.target.files);
                        e.target.value = ""; // permite reenviar o mesmo ficheiro
                      }}
                    />
                    {uploadingImages ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ImagePlus className="size-4" aria-hidden />
                    )}
                    {uploadingImages ? "A carregar…" : "Carregar imagens"}
                  </label>
                  <p className="mt-1.5 text-xs text-slate-400">
                    JPG, PNG, WEBP, GIF ou AVIF — até 10 MB por imagem.
                  </p>

                  {imageError && (
                    <p
                      role="alert"
                      className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600"
                    >
                      {imageError}
                    </p>
                  )}

                  {imageUrls.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {imageUrls.map((url, i) => (
                        <div
                          key={url}
                          className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="size-full object-cover" />
                          {/* A primeira imagem é a capa (usada na loja). */}
                          {i === 0 && (
                            <span className="absolute bottom-1 left-1 rounded bg-navy-900/80 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                              Capa
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeImage(url)}
                            aria-label={`Remover imagem ${url}`}
                            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-navy-900/70 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100"
                          >
                            <X className="size-3" aria-hidden />
                          </button>
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => setCover(url)}
                              aria-label={`Definir ${url} como capa`}
                              title="Definir como capa"
                              className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-surface/90 text-slate-500 opacity-0 shadow transition hover:text-amber-500 group-hover:opacity-100"
                            >
                              <Star className="size-3" aria-hidden />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            </section>

            {/* Especificações e variantes */}
            <section className="rounded-2xl border border-slate-100 bg-surface p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Especificações e variantes
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Opcional — enriquece a página do produto (tabela de specs e seleção de cor/tamanho).
              </p>

              {/* Especificações */}
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Especificações</p>
                {form.specs.length === 0 && (
                  <p className="mb-2 rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                    Sem especificações — adicione pares de etiqueta/valor (ex.: “Ecrã” → “AMOLED 6,7”).
                  </p>
                )}
                <div className="space-y-2">
                  {form.specs.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={s.label}
                        onChange={(e) => updateSpec(i, "label", e.target.value)}
                        placeholder="Ex.: Ecrã"
                        className="flex-1"
                      />
                      <Input
                        value={s.value}
                        onChange={(e) => updateSpec(i, "value", e.target.value)}
                        placeholder="Ex.: AMOLED 6,7 polegadas"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeSpec(i)}
                        aria-label="Remover especificação"
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addSpec}
                  className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition hover:underline"
                >
                  <Plus className="size-3.5" aria-hidden /> Adicionar especificação
                </button>
              </div>

              {/* Variantes */}
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="mb-2 text-sm font-semibold text-slate-700">Variantes</p>
                {form.variants.length === 0 && (
                  <p className="mb-2 rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                    Sem variantes — adicione por exemplo “Cor” com opções (Preto, Azul…).
                  </p>
                )}
                <div className="space-y-3">
                  {form.variants.map((v, vi) => (
                    <div key={vi} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-center gap-2">
                        <Select value={v.type} onChange={(e) => updateVariantType(vi, e.target.value)} className="w-40">
                          {VARIANT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                        <button
                          type="button"
                          onClick={() => removeVariant(vi)}
                          aria-label="Remover variante"
                          className="ml-auto flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {v.options.map((o, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <Input
                              value={o.name}
                              onChange={(e) => updateOption(vi, oi, "name", e.target.value)}
                              placeholder={v.type === "Cor" ? "Ex.: Preto" : "Ex.: M"}
                              className="flex-1"
                            />
                            {v.type === "Cor" && (
                              <div className="flex w-36 items-center gap-1.5">
                                <input
                                  type="color"
                                  value={/^#[0-9a-fA-F]{6}$/.test(o.hex) ? o.hex : "#000000"}
                                  onChange={(e) => updateOption(vi, oi, "hex", e.target.value)}
                                  aria-label="Cor da opção"
                                  className="size-9 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-surface p-0.5"
                                />
                                <Input
                                  value={o.hex}
                                  onChange={(e) => updateOption(vi, oi, "hex", e.target.value)}
                                  placeholder="#000000"
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeOption(vi, oi)}
                              aria-label="Remover opção"
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addOption(vi)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary-700 transition hover:underline"
                      >
                        <Plus className="size-3" aria-hidden /> Adicionar opção
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addVariant}
                  className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition hover:underline"
                >
                  <Plus className="size-3.5" aria-hidden /> Adicionar variante
                </button>
              </div>
            </section>
          </div>

          {/* Coluna lateral: etiquetas e publicar */}
          <aside className="h-fit space-y-4 lg:sticky lg:top-32">
            <section className="rounded-2xl border border-slate-100 bg-surface p-5">
              <h2 className="font-display text-lg font-bold text-slate-900">Etiquetas e destaque</h2>
              <div className="mt-3 space-y-1 divide-y divide-slate-100">
                {[
                  { key: "isNew", label: "Novidade" },
                  { key: "featured", label: "Destaque (home)" },
                  { key: "bestseller", label: "Mais vendido" },
                  { key: "dealOfDay", label: "Oferta do dia" },
                  { key: "freeShipping", label: "Envio grátis" },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-center justify-between gap-3 py-3"
                  >
                    <span className="text-sm font-semibold text-slate-800">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(form[opt.key as keyof typeof form])}
                      onChange={(e) => setForm((f) => ({ ...f, [opt.key]: e.target.checked }))}
                      className="size-4 accent-primary-600"
                    />
                  </label>
                ))}
              </div>
              <Input
                label="Etiquetas (tags) — separadas por vírgula"
                value={form.tags}
                onChange={setField("tags")}
                placeholder="Ex.: telemóvel, 5g, android"
                className="mt-3"
              />
            </section>

            <Button type="submit" size="lg" fullWidth loading={publishing}>
              {publishing ? "A guardar…" : editing ? "Guardar alterações" : "Publicar produto"}
            </Button>
            {publishMsg && (
              <p
                role="status"
                className={cn(
                  "rounded-xl px-3.5 py-2.5 text-xs font-semibold",
                  publishMsg.ok
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600",
                )}
              >
                {publishMsg.ok && <CheckCircle2 className="mr-1 inline size-3.5" aria-hidden />}
                {publishMsg.text}
              </p>
            )}
          </aside>
        </form>
      )}

      {/* ─── Secção: Gerir catálogo ───────────────────────────── */}
      {section === "gerir" && (
        <div className="mt-6 space-y-4">
          {/* Confirmação da publicação — a mensagem do formulário vive na
              secção anterior, que fica escondida depois de mudar de aba. */}
          {highlightId && publishMsg?.ok && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-700"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              {publishMsg.text}
            </p>
          )}

          {productsLoading && (
            <>
              <ProductSkeleton />
              <ProductSkeleton />
              <ProductSkeleton />
            </>
          )}

          {!productsLoading && (products ?? []).length === 0 && (
            <EmptyState
              icon={Package}
              title="Nenhum produto no catálogo"
              description="Publique o primeiro produto na aba “Publicar produto”."
            />
          )}

          {!productsLoading &&
            (products ?? []).map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 rounded-2xl border bg-surface p-4",
                  highlightId === p.id
                    ? "border-primary-300 ring-2 ring-primary-500/20"
                    : "border-slate-100",
                )}
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                  {p.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-slate-400">
                      <Package className="size-5" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {/* O nome também abre a página do produto na loja — o painel
                      não tem vista de detalhes própria. */}
                  <Link
                    href={`/produto/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-full truncate font-semibold text-slate-900 transition hover:text-primary-700 hover:underline"
                    aria-label={`Ver ${p.name} na loja`}
                  >
                    {p.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-400">
                    /{p.slug} · {p.category} · stock: {p.stock}
                  </p>
                  {highlightId === p.id && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="size-3" aria-hidden /> Publicado agora
                    </span>
                  )}
                </div>
                <span className="font-display font-bold text-slate-900">{format(p.price)}</span>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {/* Abre a página do produto na loja (noutra aba) — é o que se
                      quer conferir depois de publicar, sem perder o painel. */}
                  <Button
                    variant="outline"
                    size="sm"
                    href={`/produto/${p.slug}`}
                    target="_blank"
                  >
                    <Eye className="size-3.5" /> Ver na loja
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => startEdit(p)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeProduct(p)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" /> Eliminar
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ─── Secção: Newsletter ───────────────────────────────── */}
      {/* ─── Secção: Cupões ───────────────────────────────────── */}
      {section === "cupoes" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Lista de cupões */}
          <div className="space-y-3">
            {couponsLoading && (
              <>
                <ProductSkeleton />
                <ProductSkeleton />
              </>
            )}

            {!couponsLoading && (coupons ?? []).length === 0 && (
              <EmptyState
                icon={Tag}
                title="Nenhum cupão ainda"
                description="Crie o primeiro código promocional no formulário ao lado."
              />
            )}

            {!couponsLoading &&
              (coupons ?? []).map((c) => (
                <div
                  key={c.id ?? c.code}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-surface p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono font-bold text-slate-900">{c.code}</p>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-bold",
                          c.active === false
                            ? "bg-slate-100 text-slate-500"
                            : "bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {c.active === false ? "Inativo" : "Ativo"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.discountType === "PERCENT"
                        ? `${c.discountValue}%`
                        : `${format(c.discountValue)}`}
                      {c.minimumSubtotal ? ` · mínimo ${format(c.minimumSubtotal)}` : ""}
                      {c.usageLimit ? ` · ${c.usedCount ?? 0}/${c.usageLimit} utilizações` : ""}
                      {c.expiresAt ? ` · válido até ${formatDate(c.expiresAt)}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void removeCoupon(c)}>
                    <Trash2 className="size-3.5" /> Remover
                  </Button>
                </div>
              ))}
          </div>

          {/* Formulário de criação */}
          <form
            onSubmit={submitCoupon}
            className="h-fit space-y-4 rounded-2xl border border-slate-100 bg-surface p-5"
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Tag className="size-5 text-primary-600" /> Novo cupão
            </h2>
            <Input
              label="Código"
              required
              value={couponForm.code}
              onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="EX: BEMVINDO10"
            />
            <Select
              label="Tipo de desconto"
              value={couponForm.discountType}
              onChange={(e) => setCouponForm((f) => ({ ...f, discountType: e.target.value }))}
            >
              <option value="PERCENT">Percentagem (%)</option>
              <option value="FIXED">Valor fixo (MT)</option>
            </Select>
            <Input
              label={couponForm.discountType === "PERCENT" ? "Desconto (%)" : "Desconto (MT)"}
              type="number"
              min="0.01"
              step="0.01"
              required
              value={couponForm.discountValue}
              onChange={(e) => setCouponForm((f) => ({ ...f, discountValue: e.target.value }))}
              placeholder={couponForm.discountType === "PERCENT" ? "10" : "500"}
            />
            <Input
              label="Subtotal mínimo (MT)"
              type="number"
              min="0"
              step="0.01"
              value={couponForm.minimumSubtotal}
              onChange={(e) => setCouponForm((f) => ({ ...f, minimumSubtotal: e.target.value }))}
              placeholder="Opcional"
            />
            <Input
              label="Limite de utilizações"
              type="number"
              min="0"
              step="1"
              value={couponForm.usageLimit}
              onChange={(e) => setCouponForm((f) => ({ ...f, usageLimit: e.target.value }))}
              placeholder="0 = sem limite"
            />
            <Input
              label="Válido até"
              type="date"
              value={couponForm.expiresAt}
              onChange={(e) => setCouponForm((f) => ({ ...f, expiresAt: e.target.value }))}
              hint="Deixe vazio para um cupão sem validade."
            />
            <Button type="submit" fullWidth loading={couponBusy}>
              <Plus className="size-4" /> Criar cupão
            </Button>
          </form>
        </div>
      )}

      {section === "newsletter" && (
        <div className="mt-6 space-y-4">
          {subscribersLoading && (
            <>
              <ProductSkeleton />
              <ProductSkeleton />
            </>
          )}

          {!subscribersLoading && (subscribers ?? []).length === 0 && (
            <EmptyState
              icon={Mail}
              title="Nenhum subscritor ainda"
              description="Quando alguém subscrever a newsletter no rodapé da loja, aparecerá aqui."
            />
          )}

          {!subscribersLoading &&
            (subscribers ?? []).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-surface p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <Mail className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.email}</p>
                    {s.name && <p className="truncate text-xs text-slate-400">{s.name}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold",
                      s.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {s.active ? "Ativo" : "Inativo"}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(s.subscribedAt)}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ─── Secção: Pedidos ─────────────────────────────────── */}
      {section === "pedidos" && (
        <>
      {/* Filtros por estado */}
      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto pb-1">
        {ORDER_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              // Volta à primeira página: mudar de filtro mantendo a página 3
              // mostraria uma página vazia quando o estado tem poucos pedidos.
              goToPage(0);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
              statusFilter === s
                ? "border-navy-900 bg-navy-900 text-white"
                : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300",
            )}
          >
            {s}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                statusFilter === s ? "bg-white/20" : "bg-slate-100",
              )}
            >
              {counts.get(s) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Lista de pedidos */}
      <div className="mt-5 space-y-4">
        {loading && (
          <>
            <OrderSkeleton />
            <OrderSkeleton />
            <OrderSkeleton />
          </>
        )}

        {!loading && loadError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
            <p className="font-semibold">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void reload()} disabled={refreshing}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !loadError && (orders ?? []).length === 0 && (
          <EmptyState
            icon={Package}
            title={`Nenhum pedido em “${statusFilter}”`}
            description="Mude o filtro para ver os pedidos nos outros estados."
          />
        )}

        {/* ─── Pastas semanais (vista padrão em todos os filtros) ── */}
        {!loading && !loadError && (orders ?? []).length > 0 && !openGroup && (
          <>
            {groupOrders(orders ?? []).map((g) => {
              const pending = g.items.filter(
                (o) => ORDER_STATUSES.indexOf(o.status) < ORDER_STATUSES.length - 1,
              ).length;
              return (
                <div
                  key={g.key}
                  className="rounded-2xl border border-slate-100 bg-surface p-5 transition hover:border-slate-200 hover:shadow-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                          <FolderOpen className="size-5" aria-hidden />
                        </span>
                        <p className="font-display font-bold text-slate-900">
                          Semana {g.week} · {g.months.join("/")} {g.year}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                          {g.items.length} pedido{g.items.length === 1 ? "" : "s"}
                        </span>
                        {pending > 0 ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                            {pending} em curso
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            Todos concluídos
                          </span>
                        )}
                        {statusFilter && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                            {statusFilter}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <CalendarDays className="size-3.5" aria-hidden /> {weekRangeLabel(g)} · {g.key}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setOpenWeek(g.key)}>
                        <Eye className="size-3.5" /> Ver pedidos
                      </Button>
                      {/* O recibo está sempre disponível (inclusive na pasta com
                          pedidos em curso, ex.: pagamentos já confirmados). */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => printWeekReceipt(g)}
                      >
                        <Printer className="size-3.5" /> Imprimir recibo
                      </Button>
                      {pending > 0 && (
                        <Button
                          size="sm"
                          loading={advancingWeek === g.key}
                          onClick={() => {
                            void advanceAllWeek(g);
                          }}
                        >
                          Avançar estado <ArrowRight className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ─── Interior de uma pasta semanal aberta ──────────────── */}
        {!loading && !loadError && openGroup && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
              <div>
                <p className="font-display font-bold text-slate-900">
                  Semana {openGroup.week} · {openGroup.months.join("/")} {openGroup.year}
                  {statusFilter ? ` · ${statusFilter}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <CalendarDays className="mr-1 inline size-3.5" aria-hidden />
                  {weekRangeLabel(openGroup)} · {openGroup.items.length} pedido
                  {openGroup.items.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpenWeek(null)}>
                <X className="size-3.5" /> Fechar pasta
              </Button>
            </div>
            {openGroup.items.map((o) => renderOrderCard(o))}
          </>
        )}
      </div>

      {/* Paginação — feita no SERVIDOR (filtro, ordenação e limite em SQL). Só
          aparece quando há mais de uma página. */}
      {!loading && !loadError && (ordersResult?.totalPages ?? 0) > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-surface px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">
            Página {(ordersResult?.page ?? 0) + 1} de {ordersResult?.totalPages} ·{" "}
            {ordersResult?.totalItems ?? 0} pedido
            {(ordersResult?.totalItems ?? 0) === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ordersPage === 0}
              onClick={() => goToPage(ordersPage - 1)}
            >
              <ChevronLeft className="size-3.5" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!ordersResult?.hasNext}
              onClick={() => goToPage(ordersPage + 1)}
            >
              Seguinte <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
}
