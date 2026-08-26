import type { Metadata } from "next";
import { OrderTracking } from "./OrderTracking";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido ${id} — NorteShop` };
}

/**
 * Página pública de acompanhamento do pedido — é o link que vai nos emails
 * (confirmação e atualizações de estado). Funciona para guest checkouts
 * (lookup por ID) e para pedidos ligados à conta (com token).
 */
export default async function OrderTrackingPage({ params }: PageProps) {
  const { id } = await params;
  return <OrderTracking id={id} />;
}
