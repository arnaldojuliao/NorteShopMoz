"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

/** Intervalo entre cada deslize automático (para a esquerda). */
const SLIDE_EVERY_MS = 3500;
/** Depois de o utilizador mexer, quanto tempo o automático fica parado. */
const PAUSE_AFTER_TOUCH_MS = 6000;
/** Espera por silêncio antes de rodar a lista (o deslize suave já terminou). */
const ROTATE_AFTER_IDLE_MS = 220;

/**
 * Faixa de produtos das ofertas.
 *
 * No telemóvel/tablet é horizontal: linha com scroll e `snap` que avança
 * sozinha para a esquerda um cartão de cada vez e **nunca volta para trás**.
 * O truque é rodar a lista em vez de reiniciar o scroll: quando o primeiro
 * cartão já saiu por completo da vista, ele passa para o fim da fila e o
 * scroll é compensado no mesmo frame (`useLayoutEffect`) — como a compensação
 * anula exatamente o deslocamento do conteúdo, o utilizador não vê salto
 * nenhum e há sempre cartões novos a entrar pela direita. Os cartões continuam
 * a ser os mesmos (sem duplicar DOM nem links).
 *
 * O deslize pausa assim que o utilizador toca/desliza (não leva o cartão
 * debaixo do dedo) e desliga-se com `prefers-reduced-motion`. A partir de `lg`
 * o mesmo conteúdo é uma grelha de 5 colunas — sem scroll e sem animação.
 */
export function DealsRail({
  products,
  eager,
}: {
  products: Product[];
  eager?: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  /** Deslocamento a aplicar no layout effect (>=0) após rodar a lista. */
  const pendingShift = useRef(0);
  const rotateTimer = useRef<number | undefined>(undefined);
  /** Ordem renderizada: o cartão que saiu de vista passa para o fim. */
  const [order, setOrder] = useState(() => products.map((_, i) => i));

  const pause = useCallback(() => {
    pausedUntil.current = Date.now() + PAUSE_AFTER_TOUCH_MS;
  }, []);

  /** Largura de um "passo": cartão + intervalo entre cartões. */
  const stepOf = useCallback(() => {
    const cards = rail.current?.querySelectorAll("article");
    if (!cards || cards.length < 2) return 0;
    return cards[1].offsetLeft - cards[0].offsetLeft;
  }, []);

  /**
   * Roda a lista quando o primeiro cartão já saiu por completo de vista.
   * `scrollLeft` só é tocado no layout effect seguinte, antes de haver pintura.
   */
  const rotate = useCallback(() => {
    const el = rail.current;
    const cards = el?.querySelectorAll("article");
    if (!el || !cards || cards.length < 2) return;
    const first = cards[0];
    const step = cards[1].offsetLeft - cards[0].offsetLeft;
    const gone = first.offsetLeft + first.offsetWidth;
    // Ainda visível (ou sem folga) → rodar agora faria o cartão desaparecer.
    if (step <= 0 || el.scrollLeft < Math.max(gone, step)) return;
    pendingShift.current = step;
    setOrder((o) => [...o.slice(1), o[0]]);
  }, []);

  // Após rodar, o conteúdo avançou `step` px para a esquerda no DOM: corrige-se
  // o scroll antes da pintura para o ecrã ficar exatamente igual (sem salto).
  useLayoutEffect(() => {
    const el = rail.current;
    if (!el || pendingShift.current === 0) return;
    el.scrollLeft -= pendingShift.current;
    pendingShift.current = 0;
  });

  const scheduleRotate = useCallback(() => {
    window.clearTimeout(rotateTimer.current);
    rotateTimer.current = window.setTimeout(rotate, ROTATE_AFTER_IDLE_MS);
  }, [rotate]);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (el.scrollWidth <= el.clientWidth + 8) return; // desktop: grelha
      if (Date.now() < pausedUntil.current) return;

      const step = stepOf();
      if (step <= 0) return;
      const max = el.scrollWidth - el.clientWidth;
      const target = Math.min(el.scrollLeft + step, max);
      el.scrollTo({ left: target, behavior: "smooth" });
      // Sem scroll (já no fim) não há evento: rotaciona mesmo assim, para a
      // faixa continuar a andar para a esquerda em vez de ficar presa.
      window.clearTimeout(rotateTimer.current);
      rotateTimer.current = window.setTimeout(rotate, 550);
    }, SLIDE_EVERY_MS);

    return () => {
      window.clearInterval(id);
      window.clearTimeout(rotateTimer.current);
    };
  }, [products.length, rotate, stepOf]);

  // Deslize manual do utilizador: quando o scroll fica em silêncio, volta a
  // rodar a lista (assim também é infinito ao arrastar).
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    let idle: number | undefined;
    const onScroll = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(scheduleRotate, 160);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(idle);
      window.clearTimeout(rotateTimer.current);
    };
  }, [scheduleRotate]);

  return (
    <div
      ref={rail}
      onPointerDown={pause}
      onTouchStart={pause}
      onWheel={pause}
      onKeyDown={pause}
      // Telemóvel/tablet: linha horizontal. Sem snap: com snap o navegador
      // repuxava a posição assim que a lista roda (micro-salto para trás). A
      // direita: grelha de 5 colunas, sem scroll e sem animação.
      className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:pb-0"
    >
      {order.map((idx, pos) => (
        <ProductCard
          key={products[idx].id}
          product={products[idx]}
          dealLayout
          eager={eager && pos < 4}
          className="w-44 shrink-0 lg:w-auto"
        />
      ))}
    </div>
  );
}
