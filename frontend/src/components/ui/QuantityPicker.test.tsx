// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuantityPicker } from "./QuantityPicker";

describe("QuantityPicker", () => {
  it("mostra a quantidade atual", () => {
    render(<QuantityPicker value={3} onChange={vi.fn()} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("aumenta e diminui a quantidade", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuantityPicker value={2} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Aumentar quantidade" }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Diminuir quantidade" }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("não desce abaixo do mínimo (nem chama onChange)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuantityPicker value={1} onChange={onChange} />);

    const decrease = screen.getByRole("button", { name: "Diminuir quantidade" });
    expect(decrease).toBeDisabled();

    await user.click(decrease);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("não sobe acima do máximo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuantityPicker value={5} max={5} onChange={onChange} />);

    const increase = screen.getByRole("button", { name: "Aumentar quantidade" });
    expect(increase).toBeDisabled();

    await user.click(increase);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respeita um mínimo personalizado", () => {
    render(<QuantityPicker value={3} min={3} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Diminuir quantidade" })).toBeDisabled();
  });
});
