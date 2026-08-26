"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carousel leve e acessível:
 * - autoplay suave com pausa ao pairar/tocar
 * - navegação manual (setas + indicadores + teclado)
 * - conteúdo em camadas absolutas → zero layout shift
 * - sem animações pesadas (transição de opacidade/transform)
 */
export function Carousel({
  slides,
  aspect = "aspect-[16/9] md:aspect-[21/9]",
  interval = 6000,
  showArrows = true,
  showIndicators = true,
  rounded = true,
  className,
}: {
  slides: ReactNode[];
  aspect?: string;
  interval?: number;
  showArrows?: boolean;
  showIndicators?: boolean;
  rounded?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (paused || count <= 1) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), interval);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, count, interval]);

  return (
    <div
      className={cn("group/carousel relative overflow-hidden", rounded && "rounded-2xl", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      role="region"
      aria-roledescription="carrossel"
      aria-label="Banners promocionais"
    >
      <div className={cn("relative w-full", aspect)}>
        {slides.map((slide, i) => (
          <div
            key={i}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
              i === index
                ? "z-10 opacity-100 translate-x-0"
                : i < index
                  ? "opacity-0 -translate-x-4 pointer-events-none"
                  : "opacity-0 translate-x-4 pointer-events-none",
            )}
          >
            {slide}
          </div>
        ))}
      </div>

      {showArrows && count > 1 && (
        <>
          <button
            onClick={() => go(index - 1)}
            className="absolute left-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-card backdrop-blur transition hover:bg-white hover:text-primary-700 active:scale-95 sm:flex"
            aria-label="Slide anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => go(index + 1)}
            className="absolute right-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-card backdrop-blur transition hover:bg-white hover:text-primary-700 active:scale-95 sm:flex"
            aria-label="Próximo slide"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {showIndicators && count > 1 && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Ir para o slide ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/50 hover:bg-white/80",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
