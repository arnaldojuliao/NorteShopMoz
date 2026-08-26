import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from "@/components/ui/SocialIcons";
import { site, telHref, whatsappHref } from "@/config/site";

const helpLinks = [
  { label: "Sobre nós", href: "/sobre" },
  { label: "Contactos", href: "/contactos" },
  { label: "Perguntas frequentes", href: "/ajuda" },
  { label: "Entregas", href: "/entregas" },
  { label: "Ajuda", href: "/ajuda" },
];

const legalLinks = [
  { label: "Política de privacidade", href: "/privacidade" },
  { label: "Termos e condições", href: "/termos" },
  { label: "Política de devolução", href: "/devolucoes" },
];

const socials = [
  { label: "Facebook", href: site.socials.facebook, icon: FacebookIcon },
  { label: "Instagram", href: site.socials.instagram, icon: InstagramIcon },
  { label: "X (Twitter)", href: site.socials.x, icon: XIcon },
  { label: "WhatsApp", href: whatsappHref(), icon: WhatsAppIcon },
];

export function Footer() {
  return (
    <footer className="mt-16 hidden bg-navy-950 text-slate-300 lg:block">
      <div className="container-nsm grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        {/* Marca */}
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            “Compras simples, seguras e acessíveis.” A maior loja online para
            clientes em todo Moçambique.
          </p>
          <div className="mt-5 flex gap-2.5">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-primary-600 hover:text-white"
              >
                <s.icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Ajuda */}
        <nav aria-label="Links de ajuda">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
            Ajuda
          </h3>
          <ul className="space-y-2.5 text-sm">
            {helpLinks.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="transition hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Legal */}
        <nav aria-label="Links legais">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
            Informação legal
          </h3>
          <ul className="space-y-2.5 text-sm">
            {legalLinks.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="transition hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Contactos */}
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">
            Contactos
          </h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-primary-400" />
              <a href={telHref} className="transition hover:text-white">
                {site.phoneDisplay}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-primary-400" />
              <a href={`mailto:${site.email}`} className="transition hover:text-white">
                {site.email}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary-400" />
              <span>
                {site.addressLine1}, {site.addressCity}
                <br />
                {site.addressCountry}
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Horário de apoio: {site.hoursWeekdays}
            <br />
            {site.hoursSaturday}
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-nsm flex flex-col items-center justify-between gap-4 py-6 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} NorteShop (NS). Todos os direitos reservados.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-md bg-white/5 px-2.5 py-1 font-semibold text-slate-300">
              Pagamento na entrega
            </span>
            <span className="rounded-md bg-white/5 px-2.5 py-1 font-semibold text-slate-300">
              Transferência
            </span>
            <span className="rounded-md bg-white/5 px-2.5 py-1 font-semibold text-slate-300">
              M-Pesa
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
