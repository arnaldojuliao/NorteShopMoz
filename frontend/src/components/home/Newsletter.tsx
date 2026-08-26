"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";

export function Newsletter() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get("email") as string;
    if (!email) return;
    setState("sending");
    setError("");
    try {
      // Subscreve no backend (idempotente por email). Email de boas-vindas via Resend.
      await apiPost<{ data: { email: string } }>("/api/newsletter/subscribe", { email });
      setState("done");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível subscrever agora. Tente novamente mais tarde.",
      );
      setState("error");
    }
  };

  return (
    <section aria-label="Newsletter" className="container-nsm">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-navy-900 px-6 py-10 text-center sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl"
        />
        <Mail className="mx-auto mb-3 size-8 text-white/80" aria-hidden />
        <h2 className="font-display text-2xl font-extrabold text-white">
          Receba ofertas exclusivas
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-white/75">
          Subscreva e receba promoções, novidades e cupões de desconto diretamente no seu email.
        </p>
        {state === "done" ? (
          <p className="mx-auto mt-5 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white">
            <CheckCircle2 className="size-4" /> Inscrição feita com sucesso!
          </p>
        ) : (
          <>
            <form onSubmit={submit} className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row">
              <label htmlFor="newsletter-email" className="sr-only">
                Endereço de email
              </label>
              <input
                id="newsletter-email"
                name="email"
                type="email"
                required
                disabled={state === "sending"}
                placeholder="O seu email…"
                className="h-11 flex-1 rounded-xl border-0 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-white/30 disabled:opacity-70"
              />
              <button
                type="submit"
                disabled={state === "sending"}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-navy-950 px-6 text-sm font-bold text-white transition hover:bg-navy-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {state === "sending" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> A subscrever…
                  </>
                ) : (
                  "Subscrever"
                )}
              </button>
            </form>
            {state === "error" && (
              <p
                role="alert"
                className="mx-auto mt-3 flex max-w-md items-center justify-center gap-1.5 rounded-xl bg-red-500/15 px-3.5 py-2 text-xs font-semibold text-red-100"
              >
                <AlertCircle className="size-3.5 shrink-0" aria-hidden /> {error}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
