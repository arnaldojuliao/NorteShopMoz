import {
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  PackageOpen,
  Truck,
  Wallet,
  MapPin,
} from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const steps: { status: OrderStatus; icon: typeof Truck; label: string }[] = [
  { status: "Pedido recebido", icon: ClipboardCheck, label: "Pedido recebido" },
  { status: "Pagamento confirmado", icon: Wallet, label: "Pagamento confirmado" },
  { status: "Em preparação", icon: PackageOpen, label: "Em preparação" },
  { status: "Enviado", icon: PackageCheck, label: "Enviado" },
  { status: "Em trânsito", icon: Truck, label: "Em trânsito" },
  { status: "Entregue", icon: MapPin, label: "Entregue" },
];

export function StatusTimeline({ current }: { current: OrderStatus }) {
  const currentIndex = steps.findIndex((s) => s.status === current);
  const reached = (i: number) => i <= currentIndex;

  return (
    <ol className="flex flex-wrap items-center gap-y-3" aria-label="Estado do pedido">
      {steps.map((s, i) => {
        const active = i === currentIndex;
        return (
          <li key={s.status} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 transition",
                  reached(i)
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-200 bg-white text-slate-300",
                  active && "ring-4 ring-emerald-500/20",
                )}
                aria-hidden
              >
                {reached(i) ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <s.icon className="size-4" />
                )}
              </span>
              <span
                className={cn(
                  "max-w-16 text-center text-[10px] font-semibold leading-tight",
                  active ? "text-emerald-700" : reached(i) ? "text-slate-600" : "text-slate-400",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "mx-1 mb-5 h-0.5 w-6 sm:w-10",
                  reached(i) ? "bg-emerald-500" : "bg-slate-200",
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
