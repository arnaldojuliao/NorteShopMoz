"use client";

import { useState, useEffect } from "react";
import { ProductListing } from "@/components/product/ProductListing";
import { ProductImage } from "@/components/product/ProductImage";
import { repo } from "@/lib/repo";

interface CategoryPageClientProps {
  initialCategory: {
    slug: string;
    name: string;
    emoji: string;
    image: string;
    description: string;
  };
  initialProducts: Array<{
    id: string;
    slug: string;
    name: string;
    brand?: string;
    category: string;
    price: number;
    oldPrice?: number;
    rating: number;
    ratingCount: number;
    sold: number;
    stock: number;
    images: string[];
    shortDescription: string;
    description: string[];
    specs: Array<{ label: string; value: string }>;
    badges: Array<"NOVO" | "OFERTA" | "MAIS VENDIDO" | "DESTAQUE">;
    featured?: boolean;
    bestseller?: boolean;
    isNew?: boolean;
    dealOfDay?: boolean;
    variants?: Array<{ type: "Cor" | "Tamanho"; options: Array<{ name: string; hex?: string }> }>;
    deliveryDays: [number, number];
    freeShipping?: boolean;
    tags: string[];
    createdAt?: string;
  }>;
  initialCategories: Array<{
    slug: string;
    name: string;
    emoji: string;
    image: string;
    description: string;
  }>;
}

export default function CategoryPageClient({ 
  initialCategory, 
  initialProducts, 
  initialCategories 
}: CategoryPageClientProps) {
  // A categoria vem do URL: a lista lateral (que trocava a categoria sem mudar
  // de rota) saiu, portanto o slug é fixo enquanto este componente estiver montado.
  const activeSlug = initialCategory.slug;
  const [products, setProducts] = useState(initialProducts);
  const [categories] = useState(initialCategories);
  const [loading, setLoading] = useState(false);

  const currentCategory = categories.find(c => c.slug === activeSlug) || initialCategory;

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        const data = await repo.getCategoryProducts(activeSlug);
        setProducts(data);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, [activeSlug]);

  useEffect(() => {
    document.title = `${currentCategory.name} — Comprar online em Moçambique`;
  }, [currentCategory.name]);

  return (
    <div className="container-nsm py-5">

      {/* Sem menu lateral: a navegação de categorias é a faixa fixa do
          cabeçalho (presente em todas as páginas), pelo que o antigo painel
          deslizante — e o botão que o abria — saíram. */}
      <div className="flex gap-6 lg:gap-8">
        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Category banner */}
          <div className="relative overflow-hidden rounded-2xl mb-6">
            {/* `sm:aspect-[21/6]` (3,5:1) deixava ~390px de gradiente quase
                vazio a empurrar os produtos para fora do ecrã. */}
            <div className="relative aspect-[3/1] min-h-36 sm:aspect-[4/1]">
              <ProductImage
                src={currentCategory.image}
                alt={currentCategory.name}
                fill
                priority
                sizes="100vw"
                emoji={currentCategory.emoji}
                label={currentCategory.name}
                imgClassName="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-navy-950/85 via-navy-950/50 to-transparent" />
            </div>
            <div className="absolute inset-0 flex items-center">
              <div className="container-nsm">
                <span className="text-3xl" aria-hidden>{currentCategory.emoji}</span>
                <h1 className="mt-1 font-display text-2xl font-extrabold text-white sm:text-3xl">
                  {currentCategory.name}
                </h1>
                <p className="mt-1 max-w-md text-sm text-white/80">{currentCategory.description}</p>
              </div>
            </div>
          </div>

          {/* Products grid */}
          <div className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse bg-slate-100 rounded-xl" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Nenhum produto nesta categoria.</p>
              </div>
            ) : (
              <ProductListing products={products} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}