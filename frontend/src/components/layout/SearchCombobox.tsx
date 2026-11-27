"use client";

import { ChevronLeft, SearchIcon, TrendingUpIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiGet } from "@/lib/api";
import { newCategories as categories } from "@/lib/new-categories";
import { products } from "@/lib/data/products";
import {
  addSearchTerm,
  getSearchHistory,
  removeSearchTerm,
} from "@/lib/searchHistory";
import { cn } from "@/lib/utils";

/** Termos populares do painel de estado vazio. Curados, não aprendidos. */
const POPULAR_TERMS = [
  "Smartphone",
  "TV LED",
  "Fone Bluetooth",
  "Bateria",
  "Smartwatch",
  "Coluna Bluetooth",
] as const;

const MAX_SUGGESTIONS = 8;

/** O seed local é de demonstração: em produção só serve com opt-in explícito. */
const demoDataEnabled =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_DATA === "1";

interface ProductSuggestion {
  name: string;
  slug: string;
  brand?: string;
}

interface CategorizedSuggestions {
  products: ProductSuggestion[];
  brands: string[];
  categories: { name: string; slug: string }[];
}

/**
 * Combobox de pesquisa estilo AliExpress: abre no foco (inline, não é modal),
 * mostra histórico + buscas populares quando vazio e sugestões categorizadas
 * enquanto se escreve. Enter leva sempre à página de resultados /explore?q=…
 * (indexável), nunca a uma ação efémera.
 */
export function SearchCombobox({
  className,
  autoFocus = false,
  withSubmitButton = false,
  submitButtonClassName,
}: {
  className?: string;
  autoFocus?: boolean;
  /**
   * Mostra à direita um botão de lupa que submete a pesquisa (mesmo caminho do
   * Enter: `goToResults`). Usado pelo cabeçalho mobile; a pesquisa do desktop
   * fica exatamente como estava (`false` por omissão).
   */
  withSubmitButton?: boolean;
  /** Classes do botão de lupa (fundo/cores) para casar com o contexto. */
  submitButtonClassName?: string;
}) {
  const router = useRouter();
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** Ecrã pequeno (<md, o mesmo breakpoint do `MobileStoreHeader`): com o
   *  painel aberto, a pesquisa ocupa o ecrã inteiro em vez do dropdown. */
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Overlay aberto: a página deixa de rolar por baixo (o painel é que rola).
  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isMobile]);

  // Sugestões do catálogo REAL (API) com debounce — o seed local continua como
  // fallback imediato quando a API está em baixo ou o termo ainda não chegou.
  const [apiProducts, setApiProducts] = useState<ProductSuggestion[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // queueMicrotask: setState síncrono no corpo do efeito é proibido pela
      // regra react-hooks/set-state-in-effect (e causa renders em cascata).
      queueMicrotask(() => setApiProducts([]));
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      apiGet<{ data: ProductSuggestion[] }>(
        `/api/products?q=${encodeURIComponent(q)}&limit=6`,
      )
        .then((json) => {
          if (alive) setApiProducts(json.data ?? []);
        })
        .catch(() => {
          // API em baixo/timeout: mantém as sugestões locais (sem erro visível).
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  /** Abre o painel refrescando o histórico (evento de foco, não effect:
   * evita mismatch de hidratação e a regra react-hooks/set-state-in-effect). */
  const openPanel = useCallback(() => {
    setHistory(getSearchHistory());
    setOpen(true);
    setActiveIndex(-1);
  }, []);

  // Fecha ao clicar fora (o Esc é tratado no handler de teclas do input).
  // No mobile o painel é ecrã inteiro e vive fora deste elemento (portal para
  // o body) — aí só a seta de recuo, o Esc ou a navegação fecham.
  useEffect(() => {
    if (!open || isMobile) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, isMobile]);

  const suggestions = useMemo<CategorizedSuggestions>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { products: [], brands: [], categories: [] };
    // Sugestões da API primeiro (catálogo real do servidor, fresco) — só entram
    // quando ainda correspondem ao termo digitado (o debounce pode ficar atrás
    // de uma tecla). O seed local completa e serve de fallback quando a API
    // está em baixo: antes era só o seed, que divergia do catálogo real.
    const seenSlugs = new Set<string>();
    const apiMatches = apiProducts
      .filter((p) => {
        if (seenSlugs.has(p.slug)) return false;
        // O pedido é debounced: uma resposta atrasada pode ser de um termo
        // anterior. Só entra se ainda corresponder ao que está escrito.
        const haystack = `${p.name} ${p.brand ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
        seenSlugs.add(p.slug);
        return true;
      })
      .slice(0, MAX_SUGGESTIONS);
    for (const p of apiMatches) seenSlugs.add(p.slug);
    const nameMatches = demoDataEnabled
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) &&
            !seenSlugs.has(p.slug) &&
            (seenSlugs.add(p.slug) || true),
        )
      : [];
    const tagMatches = demoDataEnabled
      ? products.filter(
          (p) =>
            !nameMatches.includes(p) &&
            p.tags.some((tag) => tag.toLowerCase().includes(q)) &&
            !seenSlugs.has(p.slug) &&
            (seenSlugs.add(p.slug) || true),
        )
      : [];
    const brandSet = new Set<string>();
    if (demoDataEnabled) {
      for (const p of products) {
        const brand = p.brand;
        if (brand && brand.toLowerCase().includes(q)) brandSet.add(brand);
      }
    }
    return {
      products: [...apiMatches, ...nameMatches, ...tagMatches]
        .slice(0, MAX_SUGGESTIONS),
      brands: [...brandSet].slice(0, 3),
      categories: categories
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 3)
        .map((c) => ({ name: c.name, slug: c.slug })),
    };
    // O filtro local dos seeds depende do termo imediato; apiProducts é a
    // camada da API (debounced) que se funde à frente.
  }, [query, apiProducts]);

  const hasSuggestions =
    suggestions.products.length > 0 ||
    suggestions.brands.length > 0 ||
    suggestions.categories.length > 0;

  const goToResults = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      addSearchTerm(trimmed);
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      router.push(`/explore?q=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    goToResults(query);
  };

  const resetActive = () => setActiveIndex(-1);

  const moveActive = (delta: 1 | -1) => {
    if (!open) {
      setOpen(true);
      return;
    }
    const total = flatOptionCount(query, history, suggestions);
    if (total === 0) return;
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return total - 1;
      if (next >= total) return 0;
      return next;
    });
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        if (open && flatOptionCount(query, history, suggestions) > 0) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open && flatOptionCount(query, history, suggestions) > 0) {
          event.preventDefault();
          setActiveIndex(flatOptionCount(query, history, suggestions) - 1);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          resetActive();
        }
        break;
      case "Enter":
        // O form trata o Enter no estado por omissão; aqui só interceptamos
        // quando uma sugestão/opção está realçada.
        if (open && activeIndex >= 0) {
          event.preventDefault();
          activateIndex(activeIndex);
        }
        break;
      default:
        break;
    }
  };

  /** Executa a opção na posição achatada da lista (histórico → produtos → …). */
  const activateIndex = (index: number) => {
    const q = query.trim();
    if (!q) {
      const term = history[index];
      if (term) goToResults(term);
      return;
    }
    let i = index;
    if (i < suggestions.products.length) {
      const p = suggestions.products[i];
      router.push(`/produto/${p.slug}`);
      setOpen(false);
      return;
    }
    i -= suggestions.products.length;
    if (i < suggestions.brands.length) {
      goToResults(suggestions.brands[i]);
      return;
    }
    i -= suggestions.brands.length;
    if (i < suggestions.categories.length) {
      const c = suggestions.categories[i];
      router.push(`/categoria/${c.slug}`);
      setOpen(false);
      return;
    }
    i -= suggestions.categories.length;
    // Match exato no histórico, quando existe.
    const exact = history.find((h) => h.toLowerCase() === q.toLowerCase());
    if (exact) {
      goToResults(exact);
      return;
    }
    goToResults(q);
  };

  // Sincroniza aria-activedescendant e faz scroll da opção visível.
  const activeId =
    activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    listRef.current
      .querySelector(`#${CSS.escape(`${listboxId}-opt-${activeIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listboxId]);

  const removeHistoryEntry = (term: string) => {
    removeSearchTerm(term);
    setHistory(getSearchHistory());
  };

  // Conteúdo do painel de pesquisa (partilhado pelo dropdown do desktop e
  // pelo ecrã inteiro do mobile).
  const panelInner = (
query.trim() === "" ? (
      /* -------- Estado vazio: histórico + buscas populares -------- */
      <div className="py-2">
        {history.length > 0 ? (
          <section aria-label="Buscas recentes">
            <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Buscas recentes
            </p>
            <ul>
              {history.map((term) => (
                <li
                  key={term}
                  className="group flex items-center gap-2 px-2"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100"
                    onMouseDown={(event) => {
                      // mousedown para correr antes do blur do input.
                      event.preventDefault();
                      goToResults(term);
                    }}
                  >
                    <SearchIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-slate-500"
                    />
                    <span className="truncate">{term}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${term} do histórico`}
                    className="h-8 w-8 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => removeHistoryEntry(term)}
                  >
                    <XIcon aria-hidden="true" className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-label="Buscas populares">
          <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Buscas populares
          </p>
          <ul className="flex flex-wrap gap-2 px-4 pb-3 pt-1">
            {POPULAR_TERMS.map((term) => (
              <li key={term}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm transition-colors hover:border-primary-500/40 hover:bg-primary-50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    goToResults(term);
                  }}
                >
                  <TrendingUpIcon
                    aria-hidden="true"
                    className="size-3.5 text-primary"
                  />
                  {term}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    ) : hasSuggestions ? (
      /* -------- Sugestões categorizadas enquanto se escreve -------- */
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Sugestões de pesquisa"
        className={cn("py-2", !isMobile && "max-h-80 overflow-y-auto")}
      >
        {suggestions.products.map((product, i) => (
          <li
            key={`p-${product.slug}`}
            id={`${listboxId}-opt-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            className="mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-primary-50"
            onMouseDown={(event) => {
              event.preventDefault();
              router.push(`/produto/${product.slug}`);
              setOpen(false);
            }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <SearchIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-500"
            />
            <span className="min-w-0 flex-1 truncate">{product.name}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {product.brand}
            </span>
          </li>
        ))}
        {suggestions.brands.map((brand, i) => {
          const index = suggestions.products.length + i;
          return (
            <li
              key={`b-${brand}`}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-primary-50"
              onMouseDown={(event) => {
                event.preventDefault();
                goToResults(brand);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <SearchIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-slate-500"
              />
              <span className="min-w-0 flex-1 truncate">{brand}</span>
              <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">
                Marca
              </span>
            </li>
          );
        })}
        {suggestions.categories.map((category, i) => {
          const index =
            suggestions.products.length + suggestions.brands.length + i;
          return (
            <li
              key={`c-${category.slug}`}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-primary-50"
              onMouseDown={(event) => {
                event.preventDefault();
                router.push(`/categoria/${category.slug}`);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <SearchIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-slate-500"
              />
              <span className="min-w-0 flex-1 truncate">
                {category.name}
              </span>
              <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">
                Categoria
              </span>
            </li>
          );
        })}
        <li
          aria-hidden="true"
          className="mx-4 my-1 border-t"
          role="separator"
        />
        <li
          id={`${listboxId}-opt-all`}
          role="option"
          aria-selected={false}
          className="mx-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-primary-700 aria-selected:bg-primary-50"
          onMouseDown={(event) => {
            event.preventDefault();
            goToResults(query);
          }}
        >
          Ver todos os resultados para &ldquo;{query.trim()}&rdquo;
        </li>
      </ul>
    ) : (
      /* -------- Sem sugestões: atalho direto para resultados -------- */
      <div className="px-4 py-3 text-sm text-slate-500">
        Sem sugestões para{" "}
        <span className="font-medium text-foreground">
          &ldquo;{query.trim()}&rdquo;
        </span>
        .{" "}
        <button
          type="button"
          className="font-medium text-primary-700 underline-offset-4 hover:underline"
          onMouseDown={(event) => {
            event.preventDefault();
            goToResults(query);
          }}
        >
          Ver todos os resultados
        </button>
      </div>
    )
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit} role="search">
        <input
          ref={inputRef}
          type="search"
          name="q"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open ? activeId : undefined}
          aria-autocomplete="list"
          aria-label="Pesquisar produtos"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Pesquisar produtos, marcas…"
          className={cn(
            "h-10 w-full rounded-xl border border-slate-300 bg-slate-50/70 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-primary-500 focus:bg-surface focus:ring-4 focus:ring-primary-500/15 focus:outline-none sm:h-11",
            // Com o botão de lupa à direita, o ícone decorativo à esquerda sai e o
            // campo recua só o suficiente para o botão não o tapar.
            withSubmitButton ? "pl-3.5 pr-12" : "pl-10 pr-9",
          )}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            resetActive();
          }}
          onFocus={() => openPanel()}
          onKeyDown={onInputKeyDown}
        />
        {withSubmitButton ? (
          <button
            type="submit"
            aria-label="Pesquisar"
            className={cn(
              "absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg transition active:scale-95",
              submitButtonClassName ?? "bg-primary-600 text-white hover:bg-primary-700",
            )}
          >
            <SearchIcon className="size-4" aria-hidden />
          </button>
        ) : (
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
          />
        )}
      </form>

{open && isMobile ? (
        createPortal(
          /* -------- Mobile: ecrã inteiro ao tocar no campo --------
              Portal para o body: dentro do cabeçalho (z-50) ficava abaixo do
              BottomNav (z-[60]); fora dele, z-[80] cobre tudo, rodapé incluído. */
          <div className="fixed inset-0 z-[80] flex flex-col bg-surface animate-fade-in">
            <div className="border-b border-slate-100 px-3 py-2.5">
              <form onSubmit={handleSubmit} role="search" className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Voltar"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
                >
                  <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
                </button>
                <div className="relative min-w-0 flex-1">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="search"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listboxId}
                    aria-activedescendant={activeId}
                    aria-autocomplete="list"
                    aria-label="Pesquisar produtos"
                    autoComplete="off"
                    enterKeyHint="search"
                    placeholder="Pesquisar produtos, marcas…"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:bg-surface focus:ring-4 focus:ring-primary-500/15 focus:outline-none"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setOpen(true);
                      resetActive();
                    }}
                    onKeyDown={onInputKeyDown}
                    autoFocus
                  />
                </div>
              </form>
            </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{panelInner}</div>
          </div>,
          document.body,
        )
      ) : open ? (
        /* -------- Desktop: dropdown inline (como antes) -------- */
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-xl">
          {panelInner}
        </div>
      ) : null}
    </div>
  );
}

/** Nº de opções navegáveis por teclado no estado atual. */
function flatOptionCount(
  query: string,
  history: string[],
  suggestions: CategorizedSuggestions,
): number {
  if (query.trim() === "") return history.length;
  return (
    suggestions.products.length +
    suggestions.brands.length +
    suggestions.categories.length
  );
}
