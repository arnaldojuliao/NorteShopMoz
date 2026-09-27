"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Heart,
  Lock,
  LogIn,
  Mail,
  PackageCheck,
  User,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LogoMark } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { OtpInput } from "@/components/ui/OtpInput";
import { useAuth } from "@/context/AuthContext";
import { useEmailVerificationCode } from "@/lib/useEmailVerificationCode";
import { useLoginModal } from "@/context/LoginModalContext";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FacebookIcon, GoogleIcon } from "@/components/ui/SocialIcons";

type Mode = "login" | "register";

/** Login social — variáveis NEXT_PUBLIC_ (vazias → botões ocultos no modal). */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "";
const FACEBOOK_SDK_SRC = "https://connect.facebook.net/pt_PT/sdk.js";
const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: (notification?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
        };
      };
    };
    FB?: {
      init: (config: { appId: string; version: string; xfbml?: boolean }) => void;
      login: (
        cb: (response: { status?: string; authResponse?: { accessToken?: string } }) => void,
        options: { scope: string; return_scopes?: boolean },
      ) => void;
    };
  }
}

/** Injeta um script uma única vez (SDKs de login social). */
const loadedScripts = new Set<string>();
function loadScript(src: string): Promise<void> {
  if (loadedScripts.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error("Não foi possível carregar o serviço de login"));
    document.head.appendChild(script);
  });
}

/** Carrega e inicializa o SDK do Facebook (uma vez) com o appId da loja. */
async function getFacebookSdk() {
  const existing = window.FB;
  if (existing) return existing;
  await loadScript(FACEBOOK_SDK_SRC);
  const fb = window.FB;
  if (!fb) throw new Error("Não foi possível carregar o login do Facebook");
  fb.init({ appId: FACEBOOK_APP_ID, version: "v19.0", xfbml: false });
  return fb;
}

/** Após login/registo, volta à página inicial com a sessão já aplicada. */
function goHome(router: ReturnType<typeof useRouter>) {
  router.replace("/");
  router.refresh();
}

/** Marca NorteShopMoz (monograma + nome) — usada no painel de marca e no topo mobile. */
function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className="flex items-center gap-2.5">
      <span>
        <LogoMark className={cn("text-white", size === "sm" ? "size-10" : "size-11")}/>
       
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-extrabold tracking-tight text-white">
          Norte<span className="text-sky-400">Shop</span>Moz
        </span>
        <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.18em] text-white/60">
          Compras fáceis · Moçambique
        </span>
      </span>
    </span>
  );
}

/** Benefícios exibidos no painel de marca (desktop). */
const BENEFITS = [
  {
    icon: PackageCheck,
    title: "Acompanhe os seus pedidos",
    desc: "Estado em tempo real, do checkout à entrega.",
  },
  {
    icon: Heart,
    title: "Guarde os seus favoritos",
    desc: "As suas escolhas à mão em qualquer dispositivo.",
  },
  {
    icon: Zap,
    title: "Checkout mais rápido",
    desc: "Dados e endereços guardados para comprar num toque.",
  },
];

export function LoginModal() {
  const router = useRouter();
  const { open, closeLogin } = useLoginModal();
  const { login, register, socialLogin } = useAuth();
  const { notify } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  // Confirmação de registo: guarda o nome para mostrar na mensagem.
  const [registered, setRegistered] = useState<{ name: string; email: string } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmação do email pelo código de 6 dígitos no próprio ecrã de registo: o
  // `register` já deixa a sessão ativa, e o endpoint da confirmação por código
  // identifica a conta pela sessão.
  const {
    code,
    setCode,
    error: codeError,
    verifying,
    submit: submitCode,
    resend: resendCode,
  } = useEmailVerificationCode();
  const [codeConfirmed, setCodeConfirmed] = useState(false);

  /** Confirma o código e passa a mostrar a conta como verificada. */
  const confirmWithCode = async () => {
    if (await submitCode()) setCodeConfirmed(true);
  };

  const handleCodeSubmit = (event: FormEvent) => {
    event.preventDefault();
    void confirmWithCode();
  };

  /** Credencial (ID token) do Google → valida no backend e liga/cria a conta. */
  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setLoading(true);
      setError(null);
      try {
        await socialLogin("google", credential);
        closeLogin();
        goHome(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível entrar com o Google.");
      } finally {
        setLoading(false);
      }
    },
    [socialLogin, router, closeLogin],
  );

  /**
   * Login com Google: carrega o GSI (Identity Services) e abre o pedido de
   * credencial. Sem carregar o script, `window.google` é undefined e o botão
   * não fazia nada (falha silenciosa).
   */
  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await loadScript(GOOGLE_GSI_SRC);
      const gsi = window.google?.accounts?.id;
      if (!gsi) {
        setError("Não foi possível carregar o login do Google. Tente novamente.");
        setLoading(false);
        return;
      }
      gsi.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => {
          if (resp.credential) {
            void handleGoogleCredential(resp.credential);
          } else {
            setLoading(false);
          }
        },
        auto_select: false,
      });
      // Se o utilizador fechar o pedido sem escolher conta, repõe o botão.
      gsi.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) setLoading(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar com o Google.");
      setLoading(false);
    }
  };

  /** Login com Facebook: SDK → permissão email → access token → backend. */
  const handleFacebookLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const FB = await getFacebookSdk();
      FB.login(
        async (response) => {
          try {
            if (response?.status !== "connected" || !response.authResponse?.accessToken) {
              setError("Login com Facebook cancelado.");
              return;
            }
            await socialLogin("facebook", response.authResponse.accessToken);
            closeLogin();
            goHome(router);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Não foi possível entrar com o Facebook.");
          } finally {
            setLoading(false);
          }
        },
        { scope: "email", return_scopes: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar com o Facebook.");
      setLoading(false);
    }
  };

  // Fecha com Escape e bloqueia o scroll da página enquanto o modal está aberto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLogin();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, closeLogin]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const fullName = String(data.get("fullName") ?? "");
    const rememberMe = data.get("rememberMe") === "on";
    const name = fullName.split(" ")[0] || email.split("@")[0] || "Cliente";

    // Confirmação de palavra-passe (só no registo).
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (mode === "register" && password !== confirmPassword) {
      setError("As palavras-passe não coincidem");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const authUser =
        mode === "register"
          ? await register({ fullName, email, password, phone: "" })
          : await login(email, password, rememberMe);
      if (mode === "register") {
        // Confirmação visível de que a conta foi criada antes de entrar.
        notify("Conta criada com sucesso! Confirme o email com o link ou o código.");
        setCodeConfirmed(false);
        setRegistered({ name: authUser.fullName || name, email });
      } else {
        closeLogin();
        goHome(router);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // Erro do backend ou falha de ligação (api.ts converte rede/timeout num
        // ApiError 503 com a causa real) — mostra a mensagem verdadeira.
        setError(err.message);
      } else {
        // Falha inesperada no próprio cliente. NÃO simular sessão: sem JWT do
        // backend a conta não fica autenticada (o AuthContext continuaria com
        // user=null e o header não mudava). Mostra o erro e deixa tentar de novo.
        setError("Não foi possível concluir o login. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={mode === "login" ? "Entrar" : "Criar conta"}
        >
          {/* Fundo escuro difuso */}
          <div
            className="animate-fade-in absolute inset-0 bg-navy-950/70 backdrop-blur-sm"
            onClick={closeLogin}
          />

          {/* Painel — centrado em todas as dimensões */}
          <div className="animate-fade-up relative w-full max-w-4xl overflow-hidden rounded-2xl bg-surface shadow-2xl">
            <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              {/* ── Painel de marca (desktop) ─────────────────────────── */}
              <aside className="theme-inverse relative hidden overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-primary-800 p-10 text-white sm:flex sm:flex-col">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-sky-400/20 blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-28 -left-16 size-80 rounded-full bg-primary-400/15 blur-3xl"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-12 right-8 size-44 rounded-full border border-white/10"
                />

                <BrandMark />

                <div className="relative mt-14">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">
                    Bem-vindo à NorteShopMoz
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-white">
                    A sua loja,
                    <br />
                    sempre consigo.
                  </h2>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
                    Entre para acompanhar pedidos, guardar favoritos e comprar mais rápido.
                  </p>
                </div>

                <ul className="relative mt-10 space-y-5">
                  {BENEFITS.map((b) => (
                    <li key={b.title} className="flex items-start gap-3.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                        <b.icon className="size-4 text-sky-300" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-white">{b.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                          {b.desc}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="relative mt-auto pt-12 text-xs text-white/50">
                  Entrega para todo Moçambique · Pagamento na entrega
                </p>
              </aside>

              {/* ── Formulário ────────────────────────────────────────── */}
              <div className="relative max-h-[92dvh] overflow-y-auto p-6 sm:p-10">
                {/* Fechar (todas as dimensões) */}
                <button
                  type="button"
                  onClick={closeLogin}
                  aria-label="Fechar"
                  className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="size-4.5" />
                </button>

                <div className="mx-auto w-full max-w-sm">
                  {/* Logo da loja no topo, centrado */}
                  <div className="flex flex-col items-center text-center">
                    <LogoMark className="size-20" />
                  </div>
                  <p className="mt-2 text-center text-sm text-slate-500">
                    {mode === "login"
                      ? "Entre para acompanhar pedidos e guardar favoritos."
                      : "Registe-se para comprar mais rápido e acompanhar os seus pedidos."}
                  </p>
                  <div className="relative mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-surface shadow-sm transition-transform duration-300 ease-out",
                        mode === "register" && "translate-x-full",
                      )}
                    />
                    {(["login", "register"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m);
                          setError(null);
                        }}
                        className={cn(
                          "relative z-10 rounded-lg py-2.5 text-sm font-semibold transition",
                          mode === m ? "text-primary-700" : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        {m === "login" ? "Entrar" : "Criar conta"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={submit} className="mt-6 space-y-4">
                    {mode === "register" && (
                      <Input
                        name="fullName"
                        label="Nome completo"
                        required
                        placeholder="Ex.: Anabela dos Santos"
                        autoComplete="name"
                        leadingIcon={<User className="size-4" />}
                      />
                    )}
                    <Input
                      name="email"
                      type="email"
                      label="Email"
                      required
                      placeholder="nome@email.com"
                      autoComplete="email"
                      leadingIcon={<Mail className="size-4" />}
                    />
                    <div className="relative">
                      <Input
                        name="password"
                        type={showPw ? "text" : "password"}
                        label="Palavra-passe"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        leadingIcon={<Lock className="size-4" />}
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        aria-label={showPw ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                        className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                      >
                        {showPw ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                      </button>
                    </div>

                    {mode === "register" && (
                      <div className="relative">
                        <Input
                          name="confirmPassword"
                          type={showPw ? "text" : "password"}
                          label="Confirmar palavra-passe"
                          required
                          placeholder="••••••••"
                          autoComplete="new-password"
                          leadingIcon={<Lock className="size-4" />}
                          className="pr-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => !s)}
                          aria-label={showPw ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                          className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                        >
                          {showPw ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                        </button>
                      </div>
                    )}

                    {mode === "login" && (
                      <div className="flex justify-end">
                        <Link
                          href="/recuperar-password"
                          onClick={closeLogin}
                          className="text-xs font-semibold text-primary-700 transition hover:text-primary-800 hover:underline"
                        >
                          Esqueceu a palavra-passe?
                        </Link>
                      </div>
                    )}

                    {/* Remember me checkbox (apenas login) */}
                    {mode === "login" && (
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          name="rememberMe"
                          className="size-4 rounded border-slate-300 text-primary-700 focus:ring-primary-500"
                        />
                        Lembrar-me (30 dias)
                      </label>
                    )}

                    <Button type="submit" fullWidth size="lg" loading={loading}>
                      {mode === "login" ? (
                        <>
                          <LogIn className="size-4" /> Entrar
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" /> Criar conta
                        </>
                      )}
                    </Button>
                  </form>

                  {/* Login social — Google e Facebook (apenas ícones) */}
                  {(GOOGLE_CLIENT_ID || FACEBOOK_APP_ID) && (
                    <div className="mt-6 flex items-center justify-center gap-4">
                      {GOOGLE_CLIENT_ID && (
                        <button
                          type="button"
                          onClick={() => void handleGoogleLogin()}
                          disabled={loading}
                          className="flex items-center justify-center size-12 rounded-xl border border-slate-300 bg-surface transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                          aria-label="Continuar com o Google"
                        >
                          <GoogleIcon className="size-6" />
                        </button>
                      )}
                      {FACEBOOK_APP_ID && (
                        <button
                          type="button"
                          onClick={() => void handleFacebookLogin()}
                          disabled={loading}
                          className="flex items-center cursor-pointer justify-center size-12 rounded-xl border border-slate-300 bg-surface transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="Continuar com o Facebook"
                        >
                          <FacebookIcon className="size-6 text-[#1877F2]" />
                        </button>
                      )}
                    </div>
                  )}

                  {error && (
                    <p
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-600"
                    >
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {error}
                    </p>
                  )}

                  <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
                    Ao {mode === "login" ? "entrar" : "registar-se"}, aceita os{" "}
                    <Link
                      href="/termos"
                      onClick={closeLogin}
                      className="font-semibold text-slate-500 transition hover:text-primary-700 hover:underline"
                    >
                      Termos
                    </Link>{" "}
                    e a{" "}
                    <Link
                      href="/privacidade"
                      onClick={closeLogin}
                      className="font-semibold text-slate-500 transition hover:text-primary-700 hover:underline"
                    >
                      Política de Privacidade
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Confirmação de conta criada */}
      <Modal
        open={registered !== null}
        onClose={() => {
          if (!registered) return;
          setRegistered(null);
          closeLogin();
          goHome(router);
        }}
        title="Conta criada"
        size="sm"
        backdropClassName="bg-navy-950/70 backdrop-blur-sm"
      >
        <div className="flex flex-col items-center pb-2 pt-2 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="size-9 text-emerald-700" aria-hidden />
          </span>
          <h3 className="mt-4 font-display text-xl font-extrabold text-slate-900">
            Conta criada com sucesso!
          </h3>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-slate-500">
            Enviámos um código de 6 dígitos para{" "}
            <span className="font-semibold text-slate-700">{registered?.email}</span>. Insira-o em
            baixo para confirmar a sua conta — também pode confirmar pelo link do email.
          </p>

          {codeConfirmed ? (
            <p className="mt-5 flex w-full items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-xs font-medium leading-relaxed text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              Email confirmado! A sua conta está verificada — pode comprar, guardar favoritos e
              acompanhar pedidos.
            </p>
          ) : (
            <form
              onSubmit={handleCodeSubmit}
              className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left"
            >
              <OtpInput
                label="Código de verificação"
                value={code}
                onChange={setCode}
                onComplete={() => void confirmWithCode()}
                disabled={verifying}
                required
                error={codeError ?? undefined}
                hint={codeError ? undefined : "Válido por 24 horas · verifique também o spam."}
              />
              <Button
                type="submit"
                fullWidth
                loading={verifying}
                disabled={code.length !== 6}
                className="mt-3"
              >
                Confirmar email
              </Button>
              <button
                type="button"
                onClick={() => void resendCode()}
                className="mx-auto mt-3 block text-xs font-semibold text-primary-700 transition hover:text-primary-800 hover:underline"
              >
                Não recebeu? Enviar novo email (link e código)
              </button>
            </form>
          )}
          <Button
            className="mt-6 w-full"
            onClick={() => {
              if (!registered) return;
              setRegistered(null);
              closeLogin();
              goHome(router);
            }}
          >
            Continuar para a loja
          </Button>
        </div>
      </Modal>
    </>
  );
}