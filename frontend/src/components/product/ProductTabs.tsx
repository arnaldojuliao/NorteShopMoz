"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, ChevronDown, Loader2, Send, Star } from "lucide-react";
import type { Product, Review } from "@/lib/types";
import { getReviewsFor, getFaqsFor } from "@/lib/data/reviews";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLoginModal } from "@/context/LoginModalContext";
import { useToast } from "@/context/ToastContext";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Rating } from "@/components/ui/Rating";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "descricao", label: "Descrição" },
  { id: "especificacoes", label: "Especificações" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "perguntas", label: "Perguntas frequentes" },
] as const;

type TabId = (typeof tabs)[number]["id"];

/** Seletor de estrelas (1–5) para o formulário de avaliação. */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Classificação">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5 transition active:scale-90"
        >
          <Star
            className={cn(
              "size-6",
              (hover || value) >= n
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200 hover:fill-amber-200 hover:text-amber-200",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ProductTabs({ product }: { product: Product }) {
  const [active, setActive] = useState<TabId>("descricao");
  const { user } = useAuth();
  const { openLogin } = useLoginModal();
  const { notify } = useToast();

  // Avaliações: começa com as locais (seed) e é substituída pela API quando chega.
  const [reviews, setReviews] = useState<Review[]>(() => getReviewsFor(product));
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: "", comment: "" });

  useEffect(() => {
    let alive = true;
    apiGet<{ data: Review[] }>(
      `/api/products/${encodeURIComponent(product.slug)}/reviews`,
      15 * 60_000,
    )
      .then(({ data }) => {
        if (!alive) return;
        // Normaliza o id (Long → string) e mostra as novas no topo.
        setReviews(data.map((r) => ({ ...r, id: String(r.id) })));
      })
      .catch(() => {
        // API indisponível — mantém as avaliações locais (seed).
      });
    return () => {
      alive = false;
    };
  }, [product.slug]);

  const faqs = getFaqsFor(product);

  const submitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      notify("Entre na sua conta para avaliar este produto.");
      return;
    }
    if (form.rating < 1) {
      notify("Dê uma classificação de 1 a 5 estrelas.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await apiPost<{ data: Review }>(
        `/api/products/${encodeURIComponent(product.slug)}/reviews`,
        { rating: form.rating, title: form.title.trim() || null, comment: form.comment.trim() },
      );
      setReviews((prev) => [{ ...data, id: String(data.id) }, ...prev]);
      setForm({ rating: 0, title: "", comment: "" });
      notify("Obrigado! A sua avaliação foi publicada ⭐");
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Não foi possível enviar a avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  const logged = Boolean(user);

  return (
    <div className="mt-12">
      <div
        className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="Informação do produto"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition",
              active === t.id
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.id === "avaliacoes" && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">
                {reviews.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="pt-6"
      >
        {active === "descricao" && (
          <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-slate-600">
            {product.description.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {active === "especificacoes" && (
          <div className="max-w-3xl overflow-hidden rounded-2xl border border-slate-100">
            {product.specs.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 px-5 py-3.5 text-sm",
                  i % 2 === 0 ? "bg-slate-50/70" : "bg-white",
                )}
              >
                <span className="font-semibold text-slate-700">{s.label}</span>
                <span className="text-slate-600">{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {active === "avaliacoes" && (
          <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-5">
              <span className="font-display text-5xl font-extrabold text-slate-900">
                {product.rating.toFixed(1)}
              </span>
              <div>
                <Rating value={product.rating} size="md" />
                <p className="mt-1 text-sm text-slate-500">
                  Baseado em {product.ratingCount} avaliações verificadas
                </p>
              </div>
            </div>

            {/* Formulário de avaliação — apenas clientes autenticados */}
            {logged ? (
              <form
                onSubmit={submitReview}
                className="rounded-2xl border border-primary-100 bg-primary-50/40 p-5"
              >
                <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
                  <Star className="size-4 text-primary-600" aria-hidden /> Avalie este produto
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  A sua opinião ajuda outros clientes. Se já comprou este produto, a avaliação
                  fica marcada como compra verificada.
                </p>
                <div className="mt-3">
                  <StarPicker value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
                </div>
                <div className="mt-3 grid gap-3">
                  <Input
                    label="Título (opcional)"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex.: Excelente qualidade pelo preço"
                    maxLength={120}
                  />
                  <Textarea
                    label="Comentário"
                    required
                    rows={3}
                    value={form.comment}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    placeholder="Conte a sua experiência com o produto…"
                    maxLength={600}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <Button type="submit" size="sm" loading={submitting} disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> A publicar…
                      </>
                    ) : (
                      <>
                        <Send className="size-3.5" aria-hidden /> Publicar avaliação
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
                <p className="text-sm text-slate-500">
                  <button
                    type="button"
                    onClick={openLogin}
                    className="font-semibold text-primary-700 hover:underline"
                  >
                    Entre na sua conta
                  </button>{" "}
                  para avaliar este produto.
                </p>
              </div>
            )}

            {reviews.length === 0 ? (
              <p className="rounded-2xl border border-slate-100 p-6 text-center text-sm text-slate-400">
                Ainda não há avaliações para este produto. Seja o primeiro a avaliar!
              </p>
            ) : (
              reviews.map((r) => (
                <article key={r.id} className="rounded-2xl border border-slate-100 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.author} className="size-9" textClassName="text-sm" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{r.author}</p>
                        <p className="text-xs text-slate-400">{formatDate(r.date)}</p>
                      </div>
                    </div>
                    {r.verified && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <BadgeCheck className="size-4" /> Compra verificada
                      </span>
                    )}
                  </div>
                  <Rating value={r.rating} size="xs" className="mt-2.5" />
                  {r.title && <h4 className="mt-1.5 text-sm font-bold text-slate-800">{r.title}</h4>}
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.comment}</p>
                </article>
              ))
            )}
          </div>
        )}

        {active === "perguntas" && (
          <div className="max-w-3xl space-y-2.5">
            {faqs.map((f, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-slate-100 open:bg-slate-50/60"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
