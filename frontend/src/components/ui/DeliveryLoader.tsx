"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Preloader de entrada: um camião de contentor atravessa o ecrã a levar a
 * logomarca até ao destino.
 *
 * A estrada **é** a barra de progresso — os pneus assentam-lhe em cima e o
 * contador de percentagem cresce com ela. Ao chegar ao fim, camião e estrada
 * **desaparecem** e entra, em foco, um círculo grande com o visto e a
 * confirmação "Entrega concluída!". Não há mais nenhum indicador.
 *
 * Como funciona (e porquê assim):
 *  - O overlay vem no HTML do servidor, mas fica escondido por CSS até o script
 *    de arranque (`/preloader-init.js`) pôr `data-preloader="on"` no `<html>`.
 *    A decisão (modo full/short + sem `prefers-reduced-motion`) acontece
 *    **antes da primeira pintura**: não há flash do conteúdo nem divergência de
 *    hidratação.
 *  - O progresso é calculado em JavaScript (requestAnimationFrame) e conduz ao
 *    mesmo tempo a posição do camião, a estrada e o contador: tudo com
 *    `transform`/`opacity`, nada que force layout a cada frame.
 *  - O conteúdo principal renderiza por baixo (o componente só bloqueia o scroll
 *    enquanto o overlay tapa o ecrã) e não depende de dados nem de contexto.
 *
 * Desligar/ajustar (o componente é independente e não afeta a página):
 *   <DeliveryLoader enabled={false} />   // sem preloader
 *   <DeliveryLoader journeyMs={1200} />  // viagem mais curta
 *   NEXT_PUBLIC_PRELOADER_MS=1800        // duração base via .env
 */
// O seen (nsm:preloader, com validade) é gerido pelo /preloader-init.js, que
// decide o modo antes da primeira pintura; aqui só se lê o resultado.
const SHOW_ATTR = "data-preloader";
const MODE_ATTR = "data-preloader-mode";

type Mode = "full" | "short";

/** Viagem completa até ao destino (ms). */
const FULL_JOURNEY_MS = 2400;
/** Versão curta de visita repetida (ms) — "um silk" da marca, sem atrasar. */
const SHORT_JOURNEY_MS = 1000;
/** Pausa com o círculo de confirmação visível (ms). */
const ARRIVAL_HOLD_MS = 1000;
/** Fade-out do overlay (ms) — tem de acompanhar a transição em globals.css. */
const FADE_MS = 520;
/** Rede de segurança: nenhum caminho deixa a página escondida (ms). */
const SAFETY_MS = 9000;

type Phase = "boot" | "running" | "arrived" | "leaving" | "done";

/**
 * Fração da viagem gasta a acelerar e a travar.
 *
 * O troço do meio fica com velocidade constante — é o que dá a sensação de
 * entrega a acontecer, em vez do "salto" de um `ease-in-out` qualquer.
 */
const RAMP = 0.16;

/** Curva da viagem: arranque suave, velocidade constante, travagem suave. */
function journeyEase(t: number): number {
  const v = 1 / (1 - RAMP); // velocidade no troço constante (distância total = 1)
  if (t <= RAMP) return (0.5 * v * t * t) / RAMP;
  if (t >= 1 - RAMP) {
    const remaining = 1 - t;
    return 1 - (0.5 * v * remaining * remaining) / RAMP;
  }
  return 0.5 * v * RAMP + v * (t - RAMP);
}

/** Duração base: env por cima do padrão (inválida/zero → padrão). */
function baseJourneyMs(): number {
  const fromEnv = Number(process.env.NEXT_PUBLIC_PRELOADER_MS);
  return Number.isFinite(fromEnv) && fromEnv >= 400
    ? fromEnv
    : FULL_JOURNEY_MS;
}

export interface DeliveryLoaderProps {
  /** Desliga o preloader por completo (ex.: em testes automatizados). */
  enabled?: boolean;
  /** Duração da viagem até ao destino, em ms (por cima do modo e do env). */
  journeyMs?: number;
}

export function DeliveryLoader({ enabled = true, journeyMs }: DeliveryLoaderProps) {
  const [phase, setPhase] = useState<Phase>(enabled ? "boot" : "done");
  const [mode, setMode] = useState<Mode>("full");
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);

  const arrived = phase === "arrived" || phase === "leaving";
  const visible = phase !== "done";

  // Duração efetiva: prop > modo escolhido pelo script de arranque > env/padrão.
  const duration = journeyMs ?? (mode === "short" ? SHORT_JOURNEY_MS : baseJourneyMs());

  // Arranque: só corre se o script de /public o tiver ligado. O modo (full ou
  // short) vem do mesmo script; o seen é marcado lá, com validade de um dia.
  useEffect(() => {
    const html = document.documentElement;
    if (!enabled || html.getAttribute(SHOW_ATTR) !== "on") {
      html.removeAttribute(SHOW_ATTR);
      html.removeAttribute(MODE_ATTR);
      setPhase("done");
      return;
    }
    setMode(html.getAttribute(MODE_ATTR) === "short" ? "short" : "full");
    startRef.current = performance.now();
    document.body.classList.add("nsm-booting");
    setPhase("running");
  }, [enabled]);

  // Progresso: uma leitura de tempo por frame alimenta o camião, a estrada e o %.
  useEffect(() => {
    if (phase !== "running") return;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - startRef.current) / duration);
      setProgress(journeyEase(t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setPhase("arrived");
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, duration]);

  useEffect(() => {
    if (phase !== "arrived") return;
    const hold = setTimeout(() => setPhase("leaving"), ARRIVAL_HOLD_MS);
    return () => clearTimeout(hold);
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const fade = setTimeout(() => setPhase("done"), FADE_MS);
    return () => clearTimeout(fade);
  }, [phase]);

  // Scroll bloqueado só enquanto o overlay tapa o ecrã.
  useEffect(() => {
    if (!visible) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [visible]);

  // Rede de segurança: com o separador suspenso ou um frame perdido, o conteúdo
  // nunca fica preso atrás do preloader.
  useEffect(() => {
    if (phase !== "running" && phase !== "arrived") return;
    const safety = setTimeout(() => setPhase("done"), SAFETY_MS);
    return () => clearTimeout(safety);
  }, [phase]);

  // Liberta a entrada do conteúdo no fim (ou se a animação for interrompida) e
  // limpa o atributo de <html>. Só aqui — enquanto o atributo existir, o CSS
  // mantém o overlay visível para a transição de opacidade.
  useEffect(() => {
    if (phase !== "done") return;
    document.body.classList.remove("nsm-booting");
    document.documentElement.removeAttribute(SHOW_ATTR);
    document.documentElement.removeAttribute(MODE_ATTR);
  }, [phase]);
  useEffect(() => () => document.body.classList.remove("nsm-booting"), []);

  /** Saltar a introdução: a viagem conclui-se já e o overlay faz fade-out. */
  const skip = useCallback(() => {
    setProgress(1);
    setPhase("leaving");
  }, []);

  if (!visible) return null;

  const pct = Math.round(progress * 100);
  const traveling = phase === "running" && progress > 0.02 && progress < 0.99;

  return (
    <div
      className={cn(
        "nsm-preloader fixed inset-0 z-[70] cursor-pointer flex-col items-center justify-center px-6 transition-opacity",
        phase === "leaving" && "pointer-events-none opacity-0",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      onClick={skip}
    >
      {/* Fundo da marca (decorativo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-primary-900"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 size-[26rem] -translate-x-1/2 rounded-full bg-primary-500/20 blur-3xl sm:size-[38rem]"
      />

      {/* Viagem (some ao chegar ao destino, em transição própria) */}
      <div
        className={cn(
          "relative w-full max-w-xl transition-all duration-500",
          arrived && "pointer-events-none scale-95 opacity-0",
        )}
      >
        {/* Camião: a zona de viagem mede (estrada − camião − linha de chegada),
            para o camião parar exatamente no fim da estrada em qualquer ecrã —
            sem medir nada em JavaScript. */}
        <div className="relative h-24 sm:h-28 md:h-32">
          <div className="absolute inset-y-0 left-0 right-[11rem] sm:right-[13.5rem] md:right-[16rem]">
            <div
              className="absolute inset-0"
              style={{ transform: `translateX(${progress * 100}%)` }}
            >
              {/* Rasto discreto atrás do camião */}
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-5 right-full mr-1 flex flex-col gap-1.5 transition-opacity duration-300 sm:bottom-6 md:bottom-7",
                  traveling ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="h-[2px] w-5 animate-[nsm-trail_1.1s_ease-out_infinite] rounded-full bg-sky-200/50" />
                <span
                  className="h-[2px] w-8 animate-[nsm-trail_1.1s_ease-out_infinite] rounded-full bg-sky-200/40"
                  style={{ animationDelay: "0.18s" }}
                />
                <span
                  className="h-[2px] w-4 animate-[nsm-trail_1.1s_ease-out_infinite] rounded-full bg-sky-200/30"
                  style={{ animationDelay: "0.36s" }}
                />
              </span>

              <DeliveryTruck
                rolling={phase === "running"}
                className="absolute bottom-0 left-0 w-40 sm:w-48 md:w-56"
              />
            </div>
          </div>
        </div>

        {/* Estrada = barra de progresso (única): pneus em cima, faixa tracejada
            ao centro e linha de chegada no fim. */}
        <div
          className="relative h-3.5 w-full sm:h-4"
          role="progressbar"
          aria-label="Progresso da entrega"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div aria-hidden className="absolute inset-0 rounded-full bg-white/10" />
          {/* O `transform` inline é a única fonte de verdade do preenchimento */}
          <div
            aria-hidden
            className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-sky-400 via-primary-400 to-primary-300"
            style={{ transform: `scaleX(${progress})` }}
          />
          <div
            aria-hidden
            className="absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 rounded-full opacity-45"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #ffffff 0 10px, transparent 10px 22px)",
            }}
          />
          <div
            aria-hidden
            className="absolute right-0 top-1/2 h-7 w-[2px] -translate-y-1/2 rounded-full bg-white/25 sm:h-9"
          />
        </div>

        {/* Contador de percentagem — altura fixa para nada saltar no ecrã */}
        <div className="mt-7 flex h-24 items-start justify-center sm:h-28">
          <p className="font-display text-3xl font-extrabold tabular-nums text-white sm:text-4xl">
            {pct}
            <span className="ml-0.5 align-top text-base font-bold text-white/45 sm:text-lg">
              %
            </span>
          </p>
        </div>
      </div>

      {/* Confirmação: entra em foco depois de a viagem sair */}
      {arrived && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <span className="relative flex size-24 animate-[nsm-check_.55s_cubic-bezier(.34,1.56,.64,1)_both] items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_60px_rgba(52,211,153,0.35)] sm:size-28">
            <Check className="size-12 sm:size-14" strokeWidth={3} aria-hidden />
            <span className="absolute inset-0 animate-[nsm-ring_.9s_ease-out_forwards] rounded-full border-2 border-emerald-300" />
          </span>
          <p
            role="status"
            aria-live="polite"
            className="font-display text-base font-extrabold text-white sm:text-lg"
          >
            Entrega concluída!
          </p>
        </div>
      )}

      {/* Saltar: botão real, focável por teclado e discreto no canto. O overlay
          inteiro também salta ao clique, mas isso não é descobrível nem
          acessível por si só. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        className="absolute right-4 top-4 z-10 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-6 sm:top-6 sm:text-sm"
      >
        Saltar introdução
      </button>
    </div>
  );
}

/**
 * Camião de contentor (perfil, virado para a direita): contentor grande com a
 * **logomarca real** (`/logo-512.png`) na lateral, cabina moderna à frente e
 * três eixos. O contentor ocupa a maior parte do veículo — é a carga em viagem.
 *
 * Puro SVG inline: escala com o `viewBox`, não faz pedidos extra e as rodas
 * giram por CSS (`transform-box: fill-box`). A carroçaria balança com a
 * suspensão, mas as rodas ficam sempre em cima da estrada.
 */
function DeliveryTruck({
  rolling,
  className,
}: {
  /** Rodas a girar e ligeiro balanço da carroçaria (só durante a viagem). */
  rolling: boolean;
  className?: string;
}) {
  return (
    // O `viewBox` fecha exatamente no fundo dos pneus (y=62): com o SVG assente
    // na estrada, o camião fica com as rodas em cima da linha, sem folga.
    <svg
      viewBox="0 0 120 62"
      className={className}
      role="img"
      aria-label="Camião de entrega a transportar a sua encomenda"
    >
      <defs>
        <linearGradient id="nsm-cab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b74ff" />
          <stop offset="1" stopColor="#1b36c8" />
        </linearGradient>
        <linearGradient id="nsm-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6f0ff" />
          <stop offset="1" stopColor="#9db9ff" />
        </linearGradient>
        <clipPath id="nsm-panel">
          <rect x="2" y="5" width="84" height="39" rx="3" />
        </clipPath>
      </defs>

      <g className={rolling ? "animate-[nsm-bob_1.1s_ease-in-out_infinite]" : undefined}>
        {/* Chassis — claro o suficiente para ler o camião no fundo escuro — e
            sobreposto às rodas, para o balanço da suspensão não abrir falha. */}
        <rect x="1" y="44" width="118" height="6.5" rx="2.5" fill="#93a7cf" />

        {/* Contentor: costado, travessas e portas traseiras */}
        <rect x="2" y="5" width="84" height="39" rx="3" fill="#e8eefa" />
        <rect x="2" y="5" width="84" height="4" rx="2" fill="#cfdcf2" />
        <rect x="2" y="40" width="84" height="4" rx="2" fill="#cfdcf2" />
        <line x1="6.5" y1="9" x2="6.5" y2="40" stroke="#c3d0e8" strokeWidth="1.4" />

        {/* Logomarca real: ocupa toda a lateral do contentor (altura 5→44),
            recortada pelos limites do costado. O PNG é transparente e quase
            quadrado, por isso `meet` preenche a altura completa e centra na
            largura, sem distorcer a marca. */}
        <image
          href="/logo-512.png"
          x="2"
          y="5"
          width="84"
          height="39"
          preserveAspectRatio="xMidYMid meet"
          clipPath="url(#nsm-panel)"
        />

        {/* Cabeça do contentor (liga à cabina) */}
        <rect x="86" y="6" width="2.5" height="38" rx="1.2" fill="#c3d0e8" />

        {/* Cabina: defletor, corpo, para-brisas, janelas, farol e espelho */}
        <path d="M93 16.5 L110 15 L107.5 11 L95.5 12.2 Z" fill="#1b36c8" opacity="0.85" />
        <path
          d="M88 46 L88 22 Q88 17 93 16.5 L110 15 Q115 15 116 20 L117.5 28 L117.5 42 Q117.5 46 113 46 Z"
          fill="url(#nsm-cab)"
        />
        <rect x="92" y="21" width="13" height="9" rx="2.5" fill="#cfe0ff" opacity="0.6" />
        <path
          d="M107 18 L111.5 18.2 Q114 18.6 114.6 21.5 L115.6 30 L106 30 Z"
          fill="url(#nsm-glass)"
        />
        <line x1="106" y1="30.5" x2="106" y2="46" stroke="#1c2e7f" strokeWidth="0.9" opacity="0.75" />
        <rect x="99" y="32" width="5" height="1.6" rx="0.8" fill="#e6edfa" opacity="0.8" />
        <rect x="112.5" y="35.5" width="5" height="6.5" rx="2.2" fill="#fde68a" />
        <rect x="113.4" y="37" width="3.2" height="3.4" rx="1.6" fill="#fffbeb" />
        <rect x="110" y="44" width="8" height="3.5" rx="1.6" fill="#c3d0e8" />
        <line
          x1="105"
          y1="16"
          x2="107"
          y2="10.5"
          stroke="#93a7cf"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <rect x="105.5" y="8.5" width="3" height="4.2" rx="1.2" fill="#e6edfa" />
      </g>

      {/* Rodas: pneu, jante clara e marcas de rasto que rodam com o movimento */}
      {[22, 44, 102].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={55} r={7} fill="#334155" />
          <circle cx={cx} cy={55} r={4.8} fill="#0f172a" />
          <circle cx={cx} cy={55} r={2.8} fill="#e6edfa" />
          <g className={rolling ? "nsm-wheel" : undefined}>
            <line x1={cx} y1={51.2} x2={cx} y2={49.6} stroke="#94b4ff" strokeWidth="1.3" strokeLinecap="round" />
            <line x1={cx} y1={58.8} x2={cx} y2={60.4} stroke="#94b4ff" strokeWidth="1.3" strokeLinecap="round" />
            <line x1={cx - 3.8} y1={55} x2={cx - 5.4} y2={55} stroke="#94b4ff" strokeWidth="1.3" strokeLinecap="round" />
            <line x1={cx + 3.8} y1={55} x2={cx + 5.4} y2={55} stroke="#94b4ff" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        </g>
      ))}
    </svg>
  );
}