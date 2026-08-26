"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";

/** Evento beforeinstallprompt (Chromium/Android) — não faz parte do TS DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "nsm:install-prompt-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari antigo
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Já instalado como app ou o utilizador dispensou antes.
    if (isStandalone() || localStorage.getItem(STORAGE_KEY)) return;

    // Regista o service worker (em dev também, para o prompt nativo funcionar).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      localStorage.setItem(STORAGE_KEY, "1");
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Só mostra a notificação quando a instalação direta está disponível
  // (prompt nativo do navegador), logo que o site abre.
  useEffect(() => {
    if (!deferred || visible) return;
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, [deferred, visible]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    // Abre o prompt nativo de instalação — instala diretamente no dispositivo.
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") localStorage.setItem(STORAGE_KEY, "1");
    setDeferred(null);
    setVisible(false);
  }, [deferred]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar o app NorteShop"
      className="fixed inset-x-4 bottom-20 z-[70] mx-auto max-w-sm sm:inset-x-auto sm:bottom-6 sm:right-6 lg:bottom-6"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-hover">
        <div className="flex items-start gap-3 p-4 pb-3">
          <LogoMark className="mt-0.5 size-11 shrink-0 rounded-xl text-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Instalar o app NorteShop</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Acesso rápido, ícone no ecrã inicial e compras mais rápidas.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dispensar notificação de instalação"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={install}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.98]"
          >
            <Download className="size-4" aria-hidden /> Instalar app
          </button>
        </div>
      </div>
    </div>
  );
}
