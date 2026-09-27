import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface text-primary-600 shadow-card">
        <Icon className="size-8" />
      </div>
      {/* h2 e não h3: nos ecrãs em que este bloco é o conteúdo principal
          (favoritos, pedido não encontrado) era o primeiro título da página a
          seguir ao h1 — ou o único, deixando a página sem qualquer h1. */}
      <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {actionLabel && actionHref && (
        <Button href={actionHref} className="mt-5">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
