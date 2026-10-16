"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { CloudOff, X } from "lucide-react";
import { apiGet, isApiDown, onApiHealthChange } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Subscrição da store de disponibilidade da API (para useSyncExternalStore). */
function subscribe(onStoreChange: () => void): () => void {
  return onApiHealthChange(() => onStoreChange());
}

/** Estado atual: a API está marcada como indisponível? */
function getSnapshot(): boolean {
  return isApiDown();
}

/** No servidor não existe estado do cliente — nunca se anuncia degradação. */
function getServerSnapshot(): boolean {
  return false;
}

/** Tempo (ms) que o aviso fica visível antes de se desligar sozinho. */
const AUTO_DISMISS_MS = 12_000;

/**
 * Aviso de modo degradado — aparece quando a API está inacessível.
 *
 * Antes, o fallback para os dados locais era silencioso: a loja mostrava
 * produtos/preços/stock do seed como se fossem reais e o checkout falhava sem
 * explicação. Este aviso torna a degradação VISÍVEL para o cliente (e para o
 * operador que olhar para a loja) sem derrubar a página nem exigir recarregamento.
 *
 * <p><strong>Porquê um TOAST e não um banner:</strong> o antigo aviso fixava-se
 * ao topo da página em amarelo vivo, ACIMA de todo o conteúdo — era a primeira
 * coisa que o olhar via, antes da proposta de valor e dos produtos. Para um
 * cliente, "a loja está instável" em 72 pt equivale a "não comprem aqui".
 * A informação técnica importante para o operador passou para um toast discreto
 * no canto inferior, com fecho manual e auto-desmiss: continua visível e
 * acessível (role="status"), sem sequestrar o primeiro ecrã.</p>
 *
 * <p><strong>Sonda de arranque (uma por sessão do browser):</strong> o estado de
 * indisponibilidade vive no módulo do cliente, por isso uma página que tenha sido
 * renderizada no SERVIDOR com os dados locais (SSR com a API em baixo) não tinha
 * como mostrá-lo — o aviso só aparecia depois de uma chamada do browser falhar,
 * ou seja, possivelmente só no checkout. Uma única chamada pequena a um endpoint
 * público resolve isso no primeiro carregamento: se falhar, o aviso aparece já na
 * primeira página, que é o momento em que o cliente precisa de saber.</p>
 */
export function ApiDegradedBanner() {
  // Store externa (o módulo `lib/api`) observada com useSyncExternalStore: sem
  // `setState` dentro de um efeito (causava renders em cascata e era erro de
  // lint) e sem risco de mismatch de hidratação (o snapshot do servidor é
  // sempre `false`, como o primeiro render do cliente).
  const down = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Uma sonda por sessão (por aba): não repete em cada navegação, mas apanha a
    // página que o servidor serviu com dados de fallback.
    const PROBE_KEY = "nsm:api-probe";
    let alreadyProbed = false;
    try {
      alreadyProbed = window.sessionStorage?.getItem(PROBE_KEY) === "1";
    } catch {
      /* armazenamento bloqueado (modo privado): sonda sempre */
    }
    if (alreadyProbed) return;
    try {
      window.sessionStorage?.setItem(PROBE_KEY, "1");
    } catch {
      /* ignora */
    }
    // `/api/categories` é público e minúsculo. `apiGet` marca a API como
    // indisponível em falha de rede/5xx (o que atualiza a store observada
    // acima); o `catch` silencia os restantes casos (ex.: 403 de CORS).
    void apiGet("/api/categories", 0, true).catch(() => {});
  }, []);

  // Auto-desmiss: o aviso é útil mas não deve viver para sempre no ecrã.
  useEffect(() => {
    if (!down || dismissed) return;
    const t = window.setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [down, dismissed]);

  if (!down || dismissed) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 left-4 z-50 flex max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-card",
        "border-amber-200 bg-amber-50 text-amber-900",
        "dark:border-amber-200/20 dark:bg-amber-100 dark:text-amber-700",
      )}
    >
      <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
      <p className="text-xs leading-relaxed">
        <strong className="font-semibold">Ligação instável.</strong> Alguns preços podem
        estar desatualizados; o checkout volta a funcionar assim que a ligação recuperar.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Fechar aviso de ligação instável"
        className="-m-1 shrink-0 rounded-md p-1 text-amber-700/70 transition hover:bg-amber-200/60 hover:text-amber-900 dark:text-amber-700/70 dark:hover:bg-amber-200/20 dark:hover:text-amber-500"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
