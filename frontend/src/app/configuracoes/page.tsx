"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Heart,
  Loader2,
  LogOut,
  MapPin,
  Mail,
  Monitor,
  Moon,
  Package,
  Plus,
  RotateCcw,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarEditor } from "@/components/ui/AvatarEditor";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { isCurrencyCode } from "@/lib/currency";
import { useFavorites } from "@/context/FavoritesContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { apiPatch, apiPost, clearApiCache } from "@/lib/api";
import { useLocalStorageState } from "@/lib/hooks";
import { fetchMyAddresses, saveMyAddresses } from "@/lib/addresses";
import { fetchMyOrders, fetchOrderStatus, getOrdersKey, ORDERS_KEY } from "@/lib/orders";
import { formatDate } from "@/lib/format";
import { provinces } from "@/lib/data/provinces";
import { StatusTimeline } from "@/components/checkout/StatusTimeline";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AddressBookEntry, Order, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

const APP_NAME = "NorteShop";
const APP_VERSION = "1.0.0";
const EMPTY_USER = { email: "", name: "" };
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/* ── Tipos de preferências guardadas neste dispositivo ───────────── */

type Prefs = {
  country: string;
  currency: string;
  language: string;
  region: string;
};

const DEFAULT_PREFS: Prefs = {
  country: "Moçambique",
  currency: "MZN",
  language: "Português",
  region: "Moçambique",
};

const THEME_LABELS: Record<Theme, string> = {
  system: "Igual ao sistema",
  light: "Claro",
  dark: "Escuro",
};

type NotifPrefs = {
  emailOffers: boolean;
  emailNews: boolean;
  emailOrder: boolean;
  whatsappOffers: boolean;
  whatsappOrder: boolean;
};

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  emailOffers: true,
  emailNews: false,
  emailOrder: true,
  whatsappOffers: false,
  whatsappOrder: true,
};

/* ── Dados estáticos das opções ──────────────────────────────────── */

const countries = [
  { name: "Moçambique", flag: "🇲🇿" },
  { name: "África do Sul", flag: "🇿🇦" },
  { name: "Portugal", flag: "🇵🇹" },
];

const currencies = [
  { code: "MZN", hint: "Metical — Moçambique" },
  { code: "USD", hint: "Dólar americano" },
  { code: "ZAR", hint: "Rand sul-africano" },
];

const languages = ["Português", "Inglês"];

const regions = [
  { name: "Moçambique", flag: "🇲🇿" },
  { name: "África do Sul", flag: "🇿🇦" },
  { name: "Portugal", flag: "🇵🇹" },
];

const paymentMethods = [
  {
    name: "Pagamento na entrega",
    description: "Pague em dinheiro quando receber o pedido em casa.",
    available: true,
  },
  {
    name: "Transferência bancária",
    description: "MBCI · Standard Bank · BCI · BIM · Absa · FNB · Letshego",
    available: true,
  },
  {
    name: "M-Pesa",
    description: "Carteira móvel — pagamento rápido pelo telemóvel.",
    available: true,
  },
  {
    name: "e-Mola",
    description: "Carteira móvel do Movitel.",
    available: true,
  },
  {
    name: "Cartão Visa / Mastercard",
    description: "Pagamento com cartão internacional.",
    available: true,
  },
];

const themeOptions: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "Igual ao sistema", icon: Monitor },
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
];

const STATUS_PILL: Record<string, string> = {
  "Pedido recebido": "bg-sky-50 text-sky-700",
  "Pagamento confirmado": "bg-indigo-50 text-indigo-700",
  "Em preparação": "bg-amber-50 text-amber-700",
  Enviado: "bg-violet-50 text-violet-700",
  "Em trânsito": "bg-blue-50 text-blue-700",
  Entregue: "bg-emerald-50 text-emerald-700",
};

/** Rótulos do método de entrada da conta (cartão de perfil). */
const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: "Google",
  FACEBOOK: "Facebook",
};


/* ── Peças de UI reutilizáveis ───────────────────────────────────── */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="px-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">{title}</h2>
      <div className="mt-2.5 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  value,
  onClick,
  href,
  last = false,
}: {
  label: string;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Linha informativa (ex.: Versão) — sem chevron nem interação. */
  last?: boolean;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-800">{label}</span>
      {value != null && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-slate-400">{value}</span>
      )}
      {!last && <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />}
    </>
  );
  const cls =
    "group flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50 active:scale-[0.99] active:bg-slate-50";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  if (!last) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function OptionRow({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition hover:bg-slate-50 active:bg-slate-100"
    >
      <span className="min-w-0 flex-1 text-[15px] font-medium text-slate-800">{label}</span>
      {hint && <span className="shrink-0 text-sm text-slate-400">{hint}</span>}
      {selected && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />}
    </button>
  );
}

/* ── Página ──────────────────────────────────────────────────────── */

type SheetId =
  | "payment"
  | "country"
  | "currency"
  | "language"
  | "region"
  | "notifications"
  | "theme"
  | "privacy"
  | "cache"
  | "rate"
  | "addresses"
  | "pedidos"
  | "orders"
  | null;

const SHEET_TITLES: Record<Exclude<SheetId, null>, string> = {
  payment: "Métodos de pagamento",
  country: "Enviar o meu pedido para",
  currency: "Moeda",
  language: "Idioma",
  region: "Região",
  notifications: "Configurações de notificações",
  theme: "Modo escuro",
  privacy: "Configurações de privacidade",
  cache: "Limpar cache",
  rate: "Avalie o aplicativo",
  addresses: "Endereços de entrega",
  pedidos: "Pedidos",
  orders: "Estado dos pedidos",
};

export default function SettingsPage() {
  const router = useRouter();
  const { format, setCurrency } = useCurrency();
  const { notify } = useToast();
  const { clear: clearCart } = useCart();
  const { clear: clearFavorites } = useFavorites();
  const { openLogin } = useLoginModal();

  const [sheet, setSheet] = useState<SheetId>(null);
  const [rating, setRating] = useState(0);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const [prefs, setPrefs] = useLocalStorageState<Prefs>("nsm:prefs", DEFAULT_PREFS);
  const { theme, setTheme } = useTheme();
  const [notifPrefs, setNotifPrefs] = useLocalStorageState<NotifPrefs>(
    "nsm:notif-prefs",
    DEFAULT_NOTIF_PREFS,
  );

  // Endereços de entrega (mesma lista da área de cliente — nsm:addresses).
  // Com sessão, a lista sincroniza com o servidor (GET/PUT /api/addresses).
  const [addresses, setAddresses] = useLocalStorageState<AddressBookEntry[]>("nsm:addresses", []);
  const addressesRef = useRef(addresses);
  useEffect(() => {
    addressesRef.current = addresses;
  }, [addresses]);
  // Último utilizador já sincronizado — reinicia por sessão (login/logout).
  const addressSyncedForRef = useRef<string | null>(null);
  const lastAddressesRef = useRef(addresses);
  const [newAddr, setNewAddr] = useState({
    label: "",
    fullName: "",
    phone: "",
    address: "",
    city: "",
    province: provinces[0].name,
    coords: undefined as { lat: number; lng: number } | undefined,
  });
  const [addingAddr, setAddingAddr] = useState(false);
  const [locating, setLocating] = useState(false);

  // Perfil do utilizador (mesmos dados da área de cliente — nsm:profile/nsm:user).
  const { user: authUser, initializing, sessionExpired, logout: authLogout, updateAvatar } = useAuth();

  // Preferências de notificação: guardadas localmente (instantâneo) e sincronizadas
  // com a conta no servidor (PATCH /api/auth/me/notification-prefs) quando há sessão.
  const updateNotifPref = <K extends keyof NotifPrefs>(key: K, value: boolean) => {
    setNotifPrefs((p) => ({ ...p, [key]: value }));
    if (authUser) {
      void apiPatch("/api/auth/me/notification-prefs", { [key]: value }).catch(() => {
        notify("Não foi possível sincronizar as notificações com a sua conta.", "info");
      });
    }
  };

  // Primeira carga da sessão: o servidor é a fonte da verdade para as preferências
  // da conta (sobrepõem-se às locais deste dispositivo).
  const notifSyncedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUser?.notificationPrefs) return;
    if (notifSyncedForRef.current === authUser.id) return;
    notifSyncedForRef.current = authUser.id;
    setNotifPrefs((p) => ({ ...p, ...authUser.notificationPrefs }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Sincronização do livro de endereços com o servidor (só com sessão real).
  useEffect(() => {
    if (!authUser || addressSyncedForRef.current === authUser.id) return;
    addressSyncedForRef.current = authUser.id;
    let alive = true;
    const boot = async () => {
      const server = await fetchMyAddresses();
      if (!alive) return;
      if (server && server.length > 0) {
        // Servidor tem endereços → são a fonte da verdade (valem em qualquer dispositivo).
        setAddresses(server);
      } else if (server && server.length === 0 && addressesRef.current.length > 0) {
        // Servidor vazio mas endereços locais existem → envia-os (primeiro acesso nesta conta).
        void saveMyAddresses(addressesRef.current);
      }
    };
    void boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Persiste no servidor cada alteração (fire-and-forget; evita eco com a ref).
  useEffect(() => {
    if (!authUser || lastAddressesRef.current === addresses) return;
    lastAddressesRef.current = addresses;
    void saveMyAddresses(addresses);
  }, [addresses, authUser]);
  const [user, setUser] = useLocalStorageState("nsm:user", EMPTY_USER);
  const [profile, setProfile] = useLocalStorageState<UserProfile | null>("nsm:profile", null);
  const [editorOpen, setEditorOpen] = useState(false);

  const logged = Boolean(authUser || user.email || user.name);
  const displayName =
    profile?.fullName?.split(" ")[0] || user.name || (logged ? "Cliente" : "visitante");
  const email = authUser?.email || user.email || profile?.email;

  const saveAvatar = async (dataUrl: string) => {
    // Local primeiro (rápido); sincroniza com o servidor para valer em qualquer dispositivo.
    setProfile((prev) => ({ ...(prev ?? { fullName: "", email: "", phone: "" }), avatar: dataUrl }));
    try {
      await updateAvatar(dataUrl);
      notify("Foto de perfil guardada no servidor.");
    } catch {
      notify("Servidor indisponível — foto guardada apenas neste dispositivo.", "info");
    }
  };

  const removeAvatar = async () => {
    setProfile((prev) => (prev ? { ...prev, avatar: undefined } : prev));
    try {
      await updateAvatar(null);
    } catch {
      notify("Não foi possível sincronizar a remoção com o servidor.", "info");
    }
  };

  /** Marca a localização atual via GPS e guarda-a no endereço (único campo). */
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
        notify("Não foi possível obter a localização. Verifique as permissões do navegador.", "info");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  // Pedidos (locais + servidor) e o estado real de cada um (lookup público por ID).
  const ordersKey = authUser ? getOrdersKey(authUser.id) : ORDERS_KEY;
  const [localOrders] = useLocalStorageState<Order[]>(ordersKey, []);
  const [orders, setOrders] = useState<Order[]>(localOrders);
  const [live, setLive] = useState<Record<string, Order>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const server = await fetchMyOrders();
      if (!alive) return;
      if (server && server.length > 0) {
        // Merge por ID: servidor primeiro (completo), locais em falta no fim.
        const byId = new Map(server.map((o) => [o.id, o]));
        for (const o of localOrders) if (!byId.has(o.id)) byId.set(o.id, o);
        setOrders([...byId.values()]);
      } else {
        setOrders(localOrders);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [localOrders, authUser?.id]);

  useEffect(() => {
    let alive = true;
    Promise.all(orders.map((o) => fetchOrderStatus(o.id))).then((results) => {
      if (!alive) return;
      const merged: Record<string, Order> = {};
      for (const order of results) {
        if (order) merged[order.id] = order;
      }
      setLive(merged);
    });
    return () => {
      alive = false;
    };
  }, [orders]);

  /** Estado exibido: o real (backend) quando disponível, senão o local. */
  const statusOf = (o: Order) => live[o.id]?.status ?? o.status;

  // Sessão terminada (logout) — o redirecionamento para a home é tratado no próprio
  // botão; este ref impede o guard de o sobrepor com o modal de login.
  const loggedOutRef = useRef(false);

  // Bloqueio de acesso: sem sessão, abre o modal de login e volta à home
  // (definições é privada); sessão expirada → volta à página inicial;
  // administradores → só o painel, nunca as definições.
  useEffect(() => {
    if (loggedOutRef.current || initializing) return;
    if (sessionExpired) {
      router.replace("/");
      return;
    }
    if (authUser?.role === "ADMIN") {
      router.replace("/admin");
      return;
    }
    if (authUser) return;
    // Sessão local (login offline sem token) — também conta como "logado".
    try {
      const raw = window.localStorage.getItem("nsm:user");
      if (raw) {
        const local = JSON.parse(raw) as { email?: string; name?: string };
        if (local.email || local.name) return;
      }
    } catch {
      /* armazenamento indisponível ou JSON inválido */
    }
    openLogin();
    router.replace("/");
  }, [authUser, initializing, sessionExpired, router, openLogin]);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  const closeSheet = () => {
    setSheet(null);
    setConfirmClearAll(false);
  };

  /** Apaga os dados locais (nsm:*) — a sessão (cookies/nsm:user) é preservada. */
  const clearAllLocalData = () => {
    for (const key of [
      "nsm:cart",
      "nsm:favorites",
      "nsm:addresses",
      "nsm:profile",
      "nsm:notif-prefs",
      "nsm:prefs",
      "nsm:theme",
    ]) {
      window.localStorage.removeItem(key);
    }
    // Pedidos: chave global de convidado + todas as chaves isoladas por utilizador.
    Object.keys(window.localStorage)
      .filter((k) => k === "nsm:orders" || k.startsWith("nsm:orders:"))
      .forEach((k) => window.localStorage.removeItem(k));
    clearCart();
    clearFavorites();
    setTheme("system");
  };

  const flagOf = (name: string) => countries.find((c) => c.name === name)?.flag;

  // Enquanto o perfil de sessão está a ser confirmado no arranque, mostra um
  // carregamento em vez de revelar a página (ou redirecionar prematuramente).
  if (initializing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary-600" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-up px-4 py-2 sm:px-6">
      {/* Barra superior — voltar + título centralizado */}
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center border-b border-slate-100 py-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Voltar"
          className="flex size-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-90"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-center font-display text-lg font-bold text-slate-900">Configurações</h1>
        <span aria-hidden />
      </div>

      {/* Cartão de perfil — boas-vindas, foto com edição e sair */}
      <div className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-primary-800 to-primary-600 p-5 text-white shadow-card sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-sky-400/20 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-10 size-64 rounded-full bg-primary-400/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <span className="block rounded-full bg-gradient-to-br from-white/60 to-white/20 p-[3px]">
                <Avatar
                  src={profile?.avatar}
                  name={profile?.fullName || user.name}
                  className="size-16 sm:size-20"
                  textClassName="text-2xl sm:text-3xl"
                />
              </span>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                aria-label="Alterar foto de perfil"
                className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-white text-primary-700 shadow-md ring-2 ring-navy-900 transition hover:bg-primary-50 active:scale-95"
              >
                <Camera className="size-4" />
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-200">
                A minha conta
              </p>
              <h1 className="mt-0.5 truncate font-display text-xl font-extrabold text-white sm:text-2xl">
                Olá, {displayName}
              </h1>
              {email && <p className="mt-0.5 truncate text-sm text-white/75">{email}</p>}
{authUser?.emailVerified === false && (
                <div className="mt-2 p-3 rounded-xl bg-amber-50/50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-amber-100">
                      <Mail className="size-4 text-amber-600" aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-700">Email não verificado</p>
                      <p className="text-[10px] text-amber-600">Confirme o seu email para aceder a todas as funcionalidades.</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      onClick={async () => {
                        try {
                          await apiPost("/api/auth/resend-verification", {});
                          notify("Novo link de verificação enviado! Verifique o seu email.");
                        } catch {
                          notify("Não foi possível reenviar. Tente novamente.", "error");
                        }
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      Reenviar email
                    </Button>
                    <Button
                      onClick={openLogin}
                      variant="outline"
                      size="sm"
                    >
                      Entrar / Verificar
                    </Button>
                  </div>
                </div>
              )}
              {authUser?.authProvider && authUser.authProvider !== "EMAIL" && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200 ring-1 ring-white/15">
                  <span className="size-1.5 rounded-full bg-sky-300" aria-hidden />
                  Conta {PROVIDER_LABEL[authUser.authProvider] ?? authUser.authProvider}
                </span>
              )}
            </div>
          </div>
          {logged ? (
            <button
              type="button"
              onClick={() => {
                loggedOutRef.current = true;
                authLogout();
                setUser(EMPTY_USER);
                setProfile(null);
                router.push("/");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:border-red-300/50 hover:bg-red-500/20 active:scale-95"
            >
              <LogOut className="size-4" /> Sair
            </button>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
            >
              Entrar / Registar-se
            </button>
          )}
        </div>
      </div>

      {/* Editor da foto de perfil (montado só quando aberto) */}
      {editorOpen && (
        <AvatarEditor
          onClose={() => setEditorOpen(false)}
          current={profile?.avatar}
          onSave={saveAvatar}
          onRemove={removeAvatar}
        />
      )}

      {/* Secção 1 — Conta */}
      <Section title="Conta">
        <SettingsRow
          label="Endereços de entrega"
          onClick={() => {
            setAddingAddr(false);
            setSheet("addresses");
          }}
        />
        <SettingsRow label="Métodos de pagamento" onClick={() => setSheet("payment")} />
        <SettingsRow label="Pedidos" onClick={() => setSheet("pedidos")} />
        <SettingsRow label="Estado dos pedidos" onClick={() => setSheet("orders")} />
        <SettingsRow label="Favoritos" href="/favoritos" />
      </Section>

      {/* Secção 2 — Preferências */}
      <Section title="Preferências">
        <SettingsRow
          label="Enviar o meu pedido para"
          value={
            <>
              <span aria-hidden>{flagOf(prefs.country)}</span> {prefs.country}
            </>
          }
          onClick={() => setSheet("country")}
        />
        <SettingsRow label="Moeda" value={prefs.currency} onClick={() => setSheet("currency")} />
        <SettingsRow label="Idioma" value={prefs.language} onClick={() => setSheet("language")} />
        <SettingsRow label="Região" value={prefs.region} onClick={() => setSheet("region")} />
      </Section>

      {/* Secção 3 — Geral */}
      <Section title="Geral">
        <SettingsRow label="Configurações de notificações" onClick={() => setSheet("notifications")} />
        <SettingsRow label="Modo escuro" value={THEME_LABELS[theme]} onClick={() => setSheet("theme")} />
        <SettingsRow label="Configurações de privacidade" onClick={() => setSheet("privacy")} />
        <SettingsRow label="Limpar cache" onClick={() => setSheet("cache")} />
      </Section>

      {/* Secção 4 — Sobre */}
      <Section title="Sobre">
        <SettingsRow label="Avalie o aplicativo" onClick={() => setSheet("rate")} />
        <SettingsRow label="Configurações de privacidade" href="/privacidade" />
        <SettingsRow label="Política de privacidade" href="/privacidade" />
        <SettingsRow label="Informação legal" href="/termos" />
        <SettingsRow label="Versão" value={APP_VERSION} last />
      </Section>

      {/* Rodapé */}
      <footer className="mt-12 border-t border-slate-100 pt-6 pb-10 text-center">
        <p className="font-display text-sm font-bold text-slate-600">{APP_NAME}</p>
        <p className="mt-1 text-xs text-slate-400">Versão {APP_VERSION}</p>
        <p className="mt-1.5 text-xs text-slate-400">
          © 2026 {APP_NAME}. Todos os direitos reservados.
        </p>
      </footer>

      {/* ── Bottom sheets / modais ─────────────────────────────── */}
      <Modal
        open={sheet !== null}
        onClose={closeSheet}
        title={sheet ? SHEET_TITLES[sheet] : undefined}
        size={
          sheet === "addresses" || sheet === "pedidos" || sheet === "orders"
            ? "lg"
            : sheet === "notifications" || sheet === "privacy" || sheet === "rate"
              ? "md"
              : "sm"
        }
      >
        {sheet === "addresses" && (
          <div>
            {addresses.length === 0 && !addingAddr && (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">
                Ainda não tem endereços guardados.
              </p>
            )}

            <div className="space-y-3">
              {addresses.map((a) => (
                <div key={a.id} className="relative rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  {a.isDefault && (
                    <span className="absolute right-3 top-3 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">
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
                    onClick={() => setAddresses(addresses.filter((x) => x.id !== a.id))}
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
                    province: newAddr.province,
                    isDefault: addresses.length === 0,
                    coords: newAddr.coords,
                  };
                  setAddresses([...addresses, entry]);
                  setNewAddr({
                    label: "",
                    fullName: "",
                    phone: "",
                    address: "",
                    city: "",
                    province: provinces[0].name,
                    coords: undefined,
                  });
                  setAddingAddr(false);
                  notify("Endereço guardado.");
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
                    value={newAddr.province}
                    onChange={(e) => setNewAddr({ ...newAddr, province: e.target.value })}
                  >
                    {provinces.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {/* Localização (GPS) — um único campo: marca as coordenadas atuais */}
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <MapPin className="size-4 text-slate-400" aria-hidden /> Localização (GPS)
                  </p>
                  {newAddr.coords ? (
                    <div className="mt-2 space-y-2">
                      {GMAPS_KEY ? (
                        /* Imagem estática do Google Maps (URL dinâmica com a chave da API). */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://maps.googleapis.com/maps/api/staticmap?center=${newAddr.coords.lat},${newAddr.coords.lng}&markers=color:red%7C${newAddr.coords.lat},${newAddr.coords.lng}&zoom=16&size=600x260&scale=1&key=${GMAPS_KEY}`}
                          alt="Mapa com a sua localização"
                          loading="lazy"
                          className="h-40 w-full rounded-xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <a
                          href={`https://www.google.com/maps?q=${newAddr.coords.lat},${newAddr.coords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-primary-700 hover:underline"
                        >
                          Ver localização no Google Maps
                        </a>
                      )}
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
                            onClick={() => setNewAddr((p) => ({ ...p, coords: undefined }))}
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
                    Ao tocar, marcamos automaticamente as suas coordenadas atuais (GPS) e mostramos o
                    local no mapa — opcional.
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
        )}

        {sheet === "pedidos" &&
          (orders.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nenhum pedido ainda"
              description="Quando fizer a sua primeira compra, ela aparecerá aqui."
              actionLabel="Começar a comprar"
              actionHref="/"
            />
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <div key={o.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-display font-bold text-slate-900">{o.id}</p>
                      <p className="text-xs text-slate-400">{formatDate(live[o.id]?.date ?? o.date)}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                        STATUS_PILL[statusOf(o)] ?? "bg-slate-100 text-slate-600",
                      )}
                    >
                      {statusOf(o)}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {o.items.map((i) => (
                      <li key={i.productId + (i.variant ?? "")} className="flex justify-between gap-3">
                        <Link
                          href={`/produto/${i.slug}`}
                          className="line-clamp-1 text-slate-600 hover:text-primary-700"
                        >
                          {i.qty}× {i.name}
                        </Link>
                        <span className="shrink-0 font-semibold text-slate-800">
                          {format(i.price * i.qty)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-500">Total · {o.paymentMethod}</span>
                    <span className="font-display text-lg font-bold text-slate-900">
                      {format(live[o.id]?.total ?? o.total)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheet("orders")}
                    className="mt-3 text-sm font-semibold text-primary-700 transition hover:underline"
                  >
                    Ver estado do pedido →
                  </button>
                </div>
              ))}
            </div>
          ))}

        {sheet === "orders" &&
          (orders.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Sem pedidos para acompanhar"
              description="Os seus pedidos e o estado de entrega aparecerão aqui."
              actionLabel="Fazer a primeira compra"
              actionHref="/"
            />
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <div key={o.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-display font-bold text-slate-900">{o.id}</p>
                      <p className="text-xs text-slate-400">{formatDate(live[o.id]?.date ?? o.date)}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      {statusOf(o)}
                    </span>
                  </div>
                  <StatusTimeline current={statusOf(o)} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-500">
                      {o.paymentMethod} · {o.items.reduce((n, i) => n + i.qty, 0)}{" "}
                      {o.items.reduce((n, i) => n + i.qty, 0) === 1 ? "item" : "itens"}
                    </span>
                    <span className="font-display text-base font-bold text-slate-900">
                      {format(live[o.id]?.total ?? o.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {sheet === "payment" && (
          <div className="divide-y divide-slate-100">
            {paymentMethods.map((m) => (
              <div key={m.name} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-800">{m.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{m.description}</p>
                </div>
                {!m.available && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                    Em breve
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {sheet === "country" && (
          <div className="space-y-1">
            {countries.map((c) => (
              <OptionRow
                key={c.name}
                label={`${c.flag} ${c.name}`}
                selected={prefs.country === c.name}
                onClick={() => {
                  setPrefs((p) => ({ ...p, country: c.name, region: c.name }));
                  closeSheet();
                }}
              />
            ))}
          </div>
        )}

        {sheet === "currency" && (
          <div className="space-y-1">
            {currencies.map((c) => (
              <OptionRow
                key={c.code}
                label={c.code}
                hint={c.hint}
                selected={prefs.currency === c.code}
                onClick={() => {
                  // Atualiza a preferência guardada E o contexto global de moeda
                  // (todos os preços da loja passam a ser exibidos nesta moeda).
                  setPrefs((p) => ({ ...p, currency: c.code }));
                  if (isCurrencyCode(c.code)) setCurrency(c.code);
                  notify(
                    c.code === "MZN"
                      ? "Moeda alterada para Metical (MT)."
                      : `Moeda alterada para ${c.code} — valores convertidos a título indicativo.`,
                  );
                  closeSheet();
                }}
              />
            ))}
            <p className="px-3 pb-2 pt-1 text-xs text-slate-400">
              Os pagamentos são sempre processados em Metical (MZN); outras moedas
              são apenas para visualização, com taxas de referência fixas.
            </p>
          </div>
        )}

        {sheet === "language" && (
          <div className="space-y-1">
            {languages.map((l) => {
              const comingSoon = l !== "Português";
              return (
                <button
                  key={l}
                  type="button"
                  disabled={comingSoon}
                  aria-disabled={comingSoon}
                  onClick={() => {
                    if (comingSoon) return;
                    setPrefs((p) => ({ ...p, language: l }));
                    closeSheet();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition",
                    comingSoon ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50 active:bg-slate-100",
                  )}
                >
                  <span className="min-w-0 flex-1 text-[15px] font-medium text-slate-800">{l}</span>
                  {comingSoon ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                      Em breve
                    </span>
                  ) : (
                    prefs.language === l && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {sheet === "region" && (
          <div className="space-y-1">
            {regions.map((r) => {
              const available = r.name === "Moçambique";
              return (
                <button
                  key={r.name}
                  type="button"
                  disabled={!available}
                  aria-disabled={!available}
                  onClick={() => {
                    if (!available) return;
                    setPrefs((p) => ({ ...p, region: r.name }));
                    closeSheet();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition",
                    !available ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50 active:bg-slate-100",
                  )}
                >
                  <span className="min-w-0 flex-1 text-[15px] font-medium text-slate-800">
                    {r.flag} {r.name}
                  </span>
                  {!available ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                      Em breve
                    </span>
                  ) : (
                    prefs.region === r.name && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />
                  )}
                </button>
              );
            })}
            <p className="px-3 pb-2 pt-1 text-xs text-slate-400">
              De momento entregamos apenas em Moçambique.
            </p>
          </div>
        )}

        {sheet === "notifications" && (
          <div className="divide-y divide-slate-100">
            <Toggle
              checked={notifPrefs.emailOffers}
              onChange={(v) => updateNotifPref("emailOffers", v)}
              label="Email — ofertas e promoções"
              description="Descontos, campanhas e ofertas especiais por email"
            />
            <Toggle
              checked={notifPrefs.emailNews}
              onChange={(v) => updateNotifPref("emailNews", v)}
              label="Email — novidades"
              description="Novos produtos e lançamentos na loja"
            />
            <Toggle
              checked={notifPrefs.emailOrder}
              onChange={(v) => updateNotifPref("emailOrder", v)}
              label="Email — estado do pedido"
              description="Confirmações e atualizações de entrega"
            />
            <Toggle
              checked={notifPrefs.whatsappOffers}
              onChange={(v) => updateNotifPref("whatsappOffers", v)}
              label="WhatsApp — ofertas e promoções"
              description="Promoções enviadas por mensagem"
            />
            <Toggle
              checked={notifPrefs.whatsappOrder}
              onChange={(v) => updateNotifPref("whatsappOrder", v)}
              label="WhatsApp — estado do pedido"
              description="Acompanhe a entrega por mensagem"
            />
            <p className="pt-3 text-xs text-slate-400">
              Com sessão iniciada, as preferências ficam guardadas na sua conta e valem em
              qualquer dispositivo. Sem sessão, ficam apenas neste dispositivo.
            </p>
          </div>
        )}

        {sheet === "theme" && (
          <div className="space-y-1">
            {themeOptions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  closeSheet();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition hover:bg-slate-50 active:bg-slate-100"
              >
                <t.icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                <span className="flex-1 text-[15px] font-medium text-slate-800">{t.label}</span>
                {theme === t.id && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />}
              </button>
            ))}
          </div>
        )}

        {sheet === "privacy" && (
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => {
                clearCart();
                notify("Carrinho esvaziado.");
              }}
              className="flex w-full items-center gap-3 py-3.5 text-left text-[15px] font-semibold text-slate-700 transition hover:text-red-600"
            >
              <Trash2 className="size-4 shrink-0 text-slate-400" aria-hidden /> Esvaziar carrinho
            </button>
            <button
              type="button"
              onClick={() => {
                clearFavorites();
                notify("Favoritos removidos.");
              }}
              className="flex w-full items-center gap-3 py-3.5 text-left text-[15px] font-semibold text-slate-700 transition hover:text-red-600"
            >
              <Heart className="size-4 shrink-0 text-slate-400" aria-hidden /> Remover todos os favoritos
            </button>
            <button
              type="button"
              onClick={() => {
                // Remove a chave global de convidado e todas as chaves por utilizador.
                Object.keys(window.localStorage)
                  .filter((k) => k === "nsm:orders" || k.startsWith("nsm:orders:"))
                  .forEach((k) => window.localStorage.removeItem(k));
                setOrders([]);
                notify("Histórico local de pedidos removido.");
              }}
              className="flex w-full items-center gap-3 py-3.5 text-left text-[15px] font-semibold text-slate-700 transition hover:text-red-600"
            >
              <Package className="size-4 shrink-0 text-slate-400" aria-hidden /> Limpar histórico de pedidos local
            </button>
            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem("nsm:addresses");
                notify("Endereços guardados removidos.");
              }}
              className="flex w-full items-center gap-3 py-3.5 text-left text-[15px] font-semibold text-slate-700 transition hover:text-red-600"
            >
              <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden /> Apagar endereços guardados
            </button>

            <div className="py-3.5">
              {confirmClearAll ? (
                <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/60 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    Tem a certeza? Esta ação apaga todos os dados locais deste dispositivo, exceto a sua sessão.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        clearAllLocalData();
                        setConfirmClearAll(false);
                        closeSheet();
                        notify("Dados locais apagados.");
                      }}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-95"
                    >
                      Sim, apagar tudo
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="flex w-full items-center justify-between gap-3 text-[15px] font-semibold text-red-600 transition hover:text-red-700"
                >
                  Apagar todos os dados deste dispositivo
                  <Trash2 className="size-4 shrink-0" aria-hidden />
                </button>
              )}
            </div>
          </div>
        )}

        {sheet === "cache" && (
          <div>
            <p className="text-sm leading-relaxed text-slate-600">
              Isto remove ficheiros temporários e dados em cache guardados neste dispositivo. A sua conta,
              o carrinho, os favoritos e os pedidos não são afetados.
            </p>
            <button
              type="button"
              onClick={() => {
                clearApiCache();
                closeSheet();
                notify("Cache limpa com sucesso.");
              }}
              className="mt-5 w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-[0.98]"
            >
              Limpar cache
            </button>
          </div>
        )}

        {sheet === "rate" && (
          <div className="text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              Gosta do {APP_NAME}? A sua opinião ajuda-nos a melhorar.
            </p>
            <div className="mt-4 flex justify-center gap-2" role="group" aria-label="Avaliação por estrelas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                  className="p-1 transition hover:scale-110 active:scale-90"
                >
                  <Star
                    className={cn("size-9", n <= rating ? "text-amber-400" : "text-slate-200")}
                    fill={n <= rating ? "currentColor" : "none"}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={rating === 0}
              onClick={() => {
                notify("Obrigado pela sua avaliação! ⭐");
                closeSheet();
              }}
              className="mt-5 w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-[0.98] disabled:opacity-40"
            >
              Enviar avaliação
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
