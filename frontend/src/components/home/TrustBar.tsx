"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight, CreditCard, Lock, ShieldCheck, Truck } from "lucide-react";

const benefits = [
  { icon: Truck, label: "Entregas seguras" },
  { icon: Lock, label: "Privacidade" },
  { icon: CreditCard, label: "Pagamento seguro" },
] as const;

export function TrustBar() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion.current) return;

    intervalRef.current = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % benefits.length);
    }, 3500);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  const currentBenefit = benefits[currentIndex];
  const IconComponent = currentBenefit.icon;

  return (
    <Link
      href="/pagamentos"
      aria-label="Por que comprar aqui? Ver os métodos de pagamento"
      className="container-nsm block mt-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 sm:mt-4"
    >
      {/* Faixa de confiança em azul da marca (antes laranja/accent): o mesmo
          padrão de tinta suave (10% fundo, 30% borda) com o azul da loja. */}
      <div className="flex items-center gap-4 rounded-lg border border-brand/30 bg-brand/10 px-2 py-2.5 lg:justify-between">
        <p className="flex shrink-0 items-center gap-2 font-display text-xs font-extrabold text-primary-700">
          <ShieldCheck className="size-4 text-primary-700" aria-hidden />
          Por que comprar aqui?
        </p>

        <div className="hidden lg:flex lg:items-center lg:gap-8">
          {benefits.map((b) => {
            const Icon = b.icon;
            return (
              <span
                key={b.label}
                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600"
              >
                <Icon className="size-4 text-primary-700" aria-hidden />
                {b.label}
              </span>
            );
          })}
        </div>

        <div className="flex flex-1 lg:hidden justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentBenefit.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600"
            >
              <IconComponent className="size-4 text-primary-700" aria-hidden />
              {currentBenefit.label}
            </motion.div>
          </AnimatePresence>
        </div>

        <ChevronRight
          className="ml-auto size-4 shrink-0 text-primary-700 lg:ml-0"
          aria-hidden
        />
      </div>
    </Link>
  );
}
