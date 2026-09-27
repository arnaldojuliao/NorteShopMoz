"use client";

import { useEffect, useSyncExternalStore } from "react";
import { apiGet, isApiDown, onApiHealthChange } from "@/lib/api";

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

/**
 * Banner de modo degradado — aparece quando a API está inacessível.
 *
 * Antes, o fallback para os dados locais era silencioso: a loja mostrava
 * produtos/preços/stock do seed como se fossem reais e o checkout falhava sem
 * explicação. Este banner torna a degradação VISÍVEL para o cliente (e para o
 * operador que olhar para a loja) sem derrubar a página nem exigir recarregamento.
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

  if (!down) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      Ligação à loja instável — alguns produtos e preços podem estar desatualizados.
      O checkout volta a funcionar assim que a ligação recuperar.
    </div>
  );
}
