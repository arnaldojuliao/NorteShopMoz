import Link from "next/link";
import { Home, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="container-nsm flex flex-col items-center py-24 text-center">
      <span className="flex size-20 items-center justify-center rounded-3xl bg-primary-50 text-primary-600">
        <PackageSearch className="size-10" />
      </span>
      <p className="mt-6 font-display text-7xl font-extrabold text-primary-600">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        O produto ou página que procura não existe ou foi movida. Tente pesquisar
        ou volte à página inicial.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button href="/" variant="primary">
          <Home className="size-4" /> Ir para o início
        </Button>
        <Button href="/procurar" variant="outline">
          Procurar produtos
        </Button>
      </div>
      <Link href="/" className="mt-8 text-xs text-slate-400">
        NorteShop — Compras simples, seguras e acessíveis.
      </Link>
    </div>
  );
}
