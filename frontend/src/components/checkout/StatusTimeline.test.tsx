// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusTimeline } from "./StatusTimeline";

describe("StatusTimeline", () => {
  it("mostra os seis passos do percurso normal", () => {
    render(<StatusTimeline current="Em preparação" />);

    const timeline = screen.getByRole("list", { name: "Estado do pedido" });
    expect(timeline).toBeInTheDocument();
    for (const label of [
      "Pedido recebido",
      "Pagamento confirmado",
      "Em preparação",
      "Enviado",
      "Em trânsito",
      "Entregue",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("fora da timeline normal, mostra o aviso de aguarda pagamento", () => {
    render(<StatusTimeline current="Aguarda pagamento" />);

    expect(screen.queryByRole("list", { name: "Estado do pedido" })).not.toBeInTheDocument();
    expect(screen.getByText(/Aguarda pagamento\./)).toBeInTheDocument();
  });

  it("pedido cancelado mostra o aviso próprio", () => {
    render(<StatusTimeline current="Cancelado" />);

    expect(screen.queryByRole("list", { name: "Estado do pedido" })).not.toBeInTheDocument();
    expect(screen.getByText(/Pedido cancelado\./)).toBeInTheDocument();
  });
});
