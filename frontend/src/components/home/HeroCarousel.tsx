"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Carousel } from "@/components/ui/Carousel";
import { products } from "@/lib/data/products";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/components/auth/RequireAuth";

type HeroSlide = {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  discount: string;
  left: { src: string }[];
  right: { src: string }[];
};

const heroSlides: HeroSlide[] = [
  {
    title: "Oferta de boas-vindas",
    subtitle: "Oferta especial para novos clientes",
    cta: "Compre agora",
    href: "/explore?deal=1",
    discount: "-84%",
    left: [
      { src: products[0].images[0] },
      { src: products[6].images[0] },
      { src: products[2].images[0] },
    ],
    right: [
      { src: products[3].images[0] },
      { src: products[23].images[0] },
      { src: products[24].images[0] },
    ],
  },
  {
    title: "Eletrónica em destaque",
    subtitle: "Os melhores preços em tecnologia para si",
    cta: "Comprar agora",
    href: "/categoria/eletronicos",
    discount: "-50%",
    left: [
      { src: products[5].images[0] },
      { src: products[14].images[0] },
      { src: products[8].images[0] },
    ],
    right: [
      { src: products[7].images[0] },
      { src: products[4].images[0] },
      { src: products[10].images[0] },
    ],
  },
  {
    title: "Moda e estilo",
    subtitle: "Novas coleções a chegar à NorteShopMoz",
    cta: "Descobrir moda",
    href: "/categoria/moda",
    discount: "-30%",
    left: [
      { src: products[23].images[0] },
      { src: products[25].images[0] },
      { src: products[26].images[0] },
    ],
    right: [
      { src: products[27].images[0] },
      { src: products[32].images[0] },
      { src: products[29].images[0] },
    ],
  },
];

function ProductFloat({
  src,
  className,
  delay = 0,
  slow,
}: {
  src: string;
  className?: string;
  delay?: number;
  slow?: boolean;
}) {
  return (
    <div
      // Decoração do hero: sem isto cada leitor de ecrã anuncia os 18 nomes de
      // produto (3 slides × 6 imagens) antes do título.
      aria-hidden
      className={cn(
        "absolute overflow-hidden rounded-xl bg-white shadow-xl ring-2 ring-white/20",
        slow ? "animate-float-slow" : "animate-float",
        className,
      )}
      style={{ animationDelay: `-${delay}ms` }}
    >
      <Image
        src={src}
        alt=""
        width={320}
        height={320}
        className="aspect-square w-full object-cover"
      />
    </div>
  );
}

function HeroSlideContent({ s }: { s: HeroSlide }) {
  const { checkAuth } = useRequireAuth();
  
  const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const handled = checkAuth(() => {
      // Se autenticado, permite a navegação normal
      // Não fazemos nada aqui pois o Link já navega
    });
    if (!handled) {
      e.preventDefault();
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Produtos à esquerda — dentro do container, animados (visíveis também no telemóvel) */}
      <div className="absolute inset-y-0 left-0 block w-[28%]">
        <ProductFloat
          src={s.left[0].src}
          className="left-0 top-[30%] w-14 -rotate-6 sm:left-2 sm:w-40 lg:left-6 lg:w-52"
          delay={0}
        />
        <ProductFloat
          src={s.left[1].src}
          className="left-5 top-[4%] w-11 rotate-3 sm:left-14 sm:w-28 lg:left-24 lg:w-36"
          delay={900}
          slow
        />
        <ProductFloat
          src={s.left[2].src}
          className="bottom-[-12%] left-4 w-10 -rotate-3 sm:left-6 sm:w-24 lg:left-10 lg:w-32"
          delay={1800}
        />
      </div>

      {/* Produtos à direita — dentro do container, animados (visíveis também no telemóvel) */}
      <div className="absolute inset-y-0 right-0 block w-[28%]">
        <ProductFloat
          src={s.right[0].src}
          className="right-0 top-[30%] w-14 rotate-6 sm:right-2 sm:w-40 lg:right-6 lg:w-52"
          delay={400}
        />
        <ProductFloat
          src={s.right[1].src}
          className="right-5 top-[4%] w-11 -rotate-3 sm:right-14 sm:w-28 lg:right-24 lg:w-36"
          delay={1300}
          slow
        />
        <ProductFloat
          src={s.right[2].src}
          className="bottom-[-12%] right-4 w-10 rotate-3 sm:right-6 sm:w-24 lg:right-10 lg:w-32"
          delay={2200}
        />
      </div>

      {/* Texto promocional central */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-5">
        <div className="max-w-xl text-center">
          <h2 className="font-display text-xl font-extrabold leading-tight text-white drop-shadow-sm sm:text-3xl lg:text-4xl">
            {s.title}
          </h2>
          <p className="mt-1.5 hidden text-sm text-white/85 sm:block lg:text-base">{s.subtitle}</p>
          <Link
            href={s.href}
            onClick={handleCtaClick}
            className="group mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-red-600 shadow-lg transition-all hover:bg-red-50 hover:shadow-xl active:scale-[0.97] sm:mt-4 sm:h-12 sm:px-8 sm:text-base"
          >
            {s.cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {/* Etiqueta circular com desconto */}
      <div className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center sm:flex lg:right-6">
        <div className="relative flex size-24 items-center justify-center lg:size-32">
          <span className="absolute inset-0 animate-badge-spin rounded-full border-2 border-dashed border-white/70" />
          <span className="flex size-[82%] flex-col items-center justify-center rounded-full bg-white text-center shadow-2xl">
            <span className="font-display text-2xl font-extrabold leading-none text-red-600 lg:text-3xl">
              {s.discount}
            </span>
            <span className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-red-600">
              Desconto
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function HeroCarousel() {
  // `theme-inverse`: o hero é vermelho nos dois temas, por isso o conteúdo
  // (branco + `text-red-600` + `hover:bg-red-50`) mantém a paleta clara.
  return (
    <div className="theme-inverse relative">
      {/* Fundo vermelho full-bleed (de ponta a ponta). O vermelho é um passo
          mais escuro do que o original (red-500/600/700): sobre ele o texto
          branco do hero fica em ~6,5:1 e o subtítulo (`text-white/85`) em
          ~5,4:1 — antes ficavam em 4,1:1 e 3,3:1 (abaixo de AA). */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-red-700 to-red-800">
        <div className="absolute inset-0 bg-[radial-gradient(50%_120%_at_50%_50%,rgb(255_255_255/0.10),transparent_70%)]" />
      </div>

      {/* Carrossel alinhado ao container do site — itens e setas */}
      <Carousel
        aspect="h-[280px] sm:h-[400px]"
        interval={6000}
        rounded={false}
        className="container-nsm"
        slides={heroSlides.map((s) => (
          <HeroSlideContent key={s.title} s={s} />
        ))}
      />
    </div>
  );
}
