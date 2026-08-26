import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export interface InfoSection {
  title?: string;
  body: ReactNode;
}

export function InfoPage({
  crumb,
  title,
  subtitle,
  updatedAt,
  sections,
}: {
  crumb: string;
  title: string;
  subtitle?: string;
  updatedAt?: string;
  sections: InfoSection[];
}) {
  return (
    <div className="container-nsm max-w-3xl py-6">
      <Breadcrumbs items={[{ label: crumb }]} />
      <h1 className="mt-4 font-display text-3xl font-extrabold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-2 text-slate-500">{subtitle}</p>}
      {updatedAt && (
        <p className="mt-1 text-xs text-slate-400">Última atualização: {updatedAt}</p>
      )}
      <div className="prose-nsm mt-6 space-y-6">
        {sections.map((s, i) => (
          <section key={i}>
            {s.title && (
              <h2 className="mb-2 font-display text-lg font-bold text-slate-900">{s.title}</h2>
            )}
            <div className="text-[15px] leading-relaxed text-slate-600">{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
