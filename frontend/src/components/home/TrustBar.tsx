const benefits = [
  { emoji: "🚚", title: "Frete grátis", desc: "Em pedidos selecionados" },
  { emoji: "⚡", title: "Entrega rápida", desc: "Com reembolsos fáceis" },
  { emoji: "↩️", title: "Devoluções gratuitas", desc: "Até 90 dias" },
  { emoji: "💰", title: "Melhores preços", desc: "As melhores ofertas estão aqui" },
];

function BenefitItem({ b }: { b: (typeof benefits)[number] }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-xl"
        aria-hidden
      >
        {b.emoji}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-slate-800 lg:text-sm">
          {b.title}
        </p>
        <p className="truncate text-xs text-slate-500">{b.desc}</p>
      </div>
    </div>
  );
}

export function TrustBar() {
  // Cada metade tem 2 cópias dos benefícios para a faixa ser sempre mais
  // larga que o ecrã (o loop desliza exatamente -50% = uma metade).
  const half = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {[0, 1].map((copy) => (
        <div key={copy} className="flex items-center gap-3 pr-3 lg:gap-6 lg:pr-6">
          {benefits.map((b) => (
            <BenefitItem key={b.title} b={b} />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <section
      aria-label="Benefícios da loja"
      className="overflow-hidden border-y border-slate-100 bg-white"
    >
      {/* Mobile/tablet: scroll automático e infinito (marquee) */}
      <div className="flex w-max animate-marquee py-5 hover:[animation-play-state:paused] [mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)] lg:hidden">
        {half(false)}
        {half(true)}
      </div>
      {/* Computador: faixa estática, sem scroll automático */}
      <div className="hidden items-center justify-center gap-8 py-5 lg:flex xl:gap-12">
        {benefits.map((b) => (
          <BenefitItem key={b.title} b={b} />
        ))}
      </div>
    </section>
  );
}
