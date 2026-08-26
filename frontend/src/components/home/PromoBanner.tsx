import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";

export function PromoBanner() {
  return (
    <section aria-label="Promoção de áudio" className="container-nsm">
      <div className="group relative overflow-hidden rounded-3xl bg-navy-900">
        <div className="absolute inset-0 opacity-40">
          <Image
            src="https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1400&q=70"
            alt=""
            fill
            sizes="100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-950/70 to-navy-900/30" />
        <div className="relative flex flex-col items-start gap-4 p-6 sm:p-10 lg:max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
            <Headphones className="size-3.5" /> Áudio Premium
          </span>
          <h2 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">
            Som que acompanha o seu ritmo
          </h2>
          <p className="text-sm text-white/75 sm:text-base">
            Auscultadores e colunas com som de alta fidelidade. Descontos
            exclusivos só esta semana.
          </p>
          <Link
            href="/procurar?q=áudio"
            className="group/cta mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-navy-900 shadow-lg transition hover:bg-primary-50 active:scale-[0.98]"
          >
            Descobrir ofertas
            <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
