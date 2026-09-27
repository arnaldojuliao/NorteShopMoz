import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OrderTracking } from "./OrderTracking";
import { apiBaseUrl } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ email?: string | string[] }>;
}

/** O email de prova de contacto (link do email) — primeiro valor se repetido. */
function contactOf(searchParams: { email?: string | string[] }): string | undefined {
  const value = searchParams.email;
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Pedido ${id} — NorteShopMoz`,
    // Página privada (link do email / estado do pedido): nunca deve ser
    // indexada nem seguida por motores de busca.
    robots: { index: false, follow: false },
  };
}

/**
 * Confirma no backend se o pedido existe, reencaminhando os cookies da sessão.
 *
 * Só devolve `true` quando a API responde **404** — 200, 401 (sem sessão), 403
 * ou falha de rede deixam a decisão para a página, para nunca esconder um
 * pedido válido atrás de um 404.
 */
async function orderIsUnknown(id: string, email?: string): Promise<boolean> {
  try {
    const cookieHeader = (await cookies()).toString();
    const query = email ? `?email=${encodeURIComponent(email)}` : "";
    const res = await fetch(`${apiBaseUrl()}/api/orders/${encodeURIComponent(id)}${query}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Página pública de acompanhamento do pedido — é o link que vai nos emails
 * (confirmação e atualizações de estado). Funciona para guest checkouts
 * (lookup por ID) e para pedidos ligados à conta (com token).
 */
export default async function OrderTrackingPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const contact = contactOf(await searchParams);
  // Pedido inexistente → 404 real (antes era um 200 com «não encontrado»).
  if (await orderIsUnknown(id, contact)) notFound();
  return <OrderTracking id={id} email={contact} />;
}
