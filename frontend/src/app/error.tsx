"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Fronteira de erro da aplicação (App Router).
 *
 * Sem ela, qualquer exceção de cliente mostrava o ecrã genérico do Next
 * («Application error») e matava a rota inteira — um produto mal publicado
 * derrubava a própria página para sempre. Aqui o erro fica contido: mensagem
 * honesta, botão de repetir (`reset` refaz o segmento) e saída para a loja.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Registo local do erro (o `digest` é o que a Release Engineering consegue
    // correlacionar com os logs do servidor).
    console.error("[NSM] Erro de cliente:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 shadow-card">
          <AlertTriangle className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
          Algo correu mal
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Ocorreu um erro inesperado ao mostrar esta página. Tente novamente —
          se persistir, contacte o apoio ao cliente.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-slate-400">Referência: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
          <Button onClick={reset}>Tentar novamente</Button>
          <Button variant="outline" href="/">
            Voltar à loja
          </Button>
        </div>
      </div>
    </div>
  );
}
