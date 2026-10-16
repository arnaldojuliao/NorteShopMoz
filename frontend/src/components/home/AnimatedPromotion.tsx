"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Shield,
  Lock,
  Truck,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { promotionMessages, type PromotionMessage, type IconName } from "@/lib/store-benefits";
import { cn } from "@/lib/utils";

const iconMap: Record<IconName, React.ComponentType<{ className?: string }>> = {
  CheckCircle2,
  Shield,
  Lock,
  Truck,
  RotateCcw,
  MessageSquare,
  Coins: ({ className }) => <svg className={className} />,
  Package: ({ className }) => <svg className={className} />,
  Star: ({ className }) => <svg className={className} />,
  Headphones: ({ className }) => <svg className={className} />,
};

interface AnimatedPromotionProps {
  messages?: PromotionMessage[];
  intervalMs?: number;
  className?: string;
}

export function AnimatedPromotion({
  messages = promotionMessages,
  intervalMs = 3500,
  className,
}: AnimatedPromotionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion.current) return;

    intervalRef.current = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [messages.length, intervalMs]);

  const currentMessage = messages[currentIndex];
  const IconComponent = iconMap[currentMessage.icon];

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        className
      )}
      role="region"
      aria-live="polite"
      aria-label="Mensagens promocionais"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMessage.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2 lg:gap-3 min-h-[44px] lg:min-h-[56px]"
        >
          <div
            className={cn(
              "shrink-0 flex items-center justify-center rounded-full bg-primary-100 text-primary-700",
              "size-8 lg:size-10"
            )}
            aria-hidden="true"
          >
            <IconComponent className="size-4 lg:size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-slate-900 text-sm lg:text-base">
              {currentMessage.title}
            </h3>
            <p className="mt-0.5 text-xs lg:text-sm text-slate-600 leading-snug">
              {currentMessage.subtitle}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}