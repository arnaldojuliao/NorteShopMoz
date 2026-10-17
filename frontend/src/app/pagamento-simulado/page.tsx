"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { apiPost } from "@/lib/api";
import { formatMZN } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Página de pagamento SIMULADA (dev/demo) — imita o checkout hospedado de um
 * provedor (PaySuite). O backend simulado devolve o link para esta página em
 * vez de cobrar diretamente, para o fluxo de demonstração ser idêntico ao de
 * produção: selecionar método → comprar → aguardar link → pagar → regresso à
 * loja com o pedido confirmado.
 *
 * Confirmar/falhar chama POST /api/payments/simulated/{confirm|fail} — um
 * endpoint que só existe fora de produção (o "provedor" é a própria loja).
 */

const METHOD_NAMES: Record<string, string> = {
  mpesa: "M-Pesa",
  emola: "e-Mola",
  mkesh: "mKesh",
  card: "Cartão Visa / Mastercard",
};

export default function PagamentoSimuladoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary-600" />
        </div>
      }
    >
      <PagamentoSimuladoView />
    </Suspense>
  );
}

function PagamentoSimuladoView() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = params.get("ref") ?? "";
  const orderId = params.get("order") ?? "";
  const methodId = params.get("method") ?? "";
  const amount = params.get("amount") ?? "";

  const [busy, setBusy] = useState<"confirm" | "fail" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const methodName = METHOD_NAMES[methodId] ?? "Pagamento online";
  const amountLabel = amount ? formatMZN(Number(amount)) : "";

  const report = async (outcome: "confirm" | "fail") => {
    setBusy(outcome);
    setError(null);
    try {
      await apiPost<{ data: { orderId?: string } }>(
        `/api/payments/simulated/${outcome}`,
        { ref },
      );
      // Regresso à loja — a página de acompanhamento reflete o estado novo
      // (confirmado, ou "aguarda pagamento" com a falha na fila do admin).
      router.replace(`/pedido/${encodeURIComponent(orderId || ref)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reportar o pagamento.");
      setBusy(null);
    }
  };

  if (!ref) {
    return (
      <div className="container-nsm flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <XCircle className="size-12 text-red-500" />
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">Link de pagamento inválido</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Este link de pagamento não tem uma referência válida. Volte à loja e tente concluir a
          compra novamente.
        </p>
        <Button href="/" variant="outline" className="mt-6">
          Voltar à loja
        </Button>
      </div>
    );
  }

  return (
    <div className="theme-inverse flex min-h-screen flex-col bg-navy-950">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <Logo light />
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
          <ShieldCheck className="size-3.5" /> Página de pagamento segura
        </span>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Ambiente de demonstração
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-900">
            Pagar com {methodName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pedido <span className="font-semibold text-slate-700">{orderId || ref}</span>
            {amountLabel ? (
              <>
                {" · "}
                <span className="font-semibold text-slate-700">{amountLabel}</span>
              </>
            ) : null}
          </p>

          <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
            Nenhum dado real é enviado — este é o simulador do provedor usado em
            desenvolvimento. Em produção, esta página seria o checkout seguro da PaySuite
            (M-Pesa / e-Mola / cartão).
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}

          <div className="mt-6 space-y-2.5">
            <Button
              size="lg"
              fullWidth
              loading={busy === "confirm"}
              disabled={busy !== null}
              onClick={() => void report("confirm")}
              className={cn(busy === "fail" && "opacity-60")}
            >
              <CheckCircle2 className="size-5" aria-hidden />
              Confirmar pagamento {amountLabel ? `(${amountLabel})` : ""}
            </Button>
            <Button
              variant="outline"
              size="lg"
              fullWidth
              loading={busy === "fail"}
              disabled={busy !== null}
              onClick={() => void report("fail")}
              className="border-slate-200 text-slate-600"
            >
              <XCircle className="size-4" aria-hidden />
              Simular falha no pagamento
            </Button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Depois de confirmar, regressa automaticamente à loja para acompanhar o pedido.{" "}
            <Link href="/" className="font-semibold text-primary-600 hover:underline">
              Cancelar e voltar
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
