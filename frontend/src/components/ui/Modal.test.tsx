// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("não renderiza nada quando está fechado", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Detalhes">
        conteúdo
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra título e conteúdo quando está aberto", () => {
    render(
      <Modal open onClose={vi.fn()} title="Detalhes">
        conteúdo do modal
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Detalhes" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("conteúdo do modal")).toBeInTheDocument();
  });

  it("fecha no botão de fechar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Detalhes">
        conteúdo
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fecha com a tecla Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Detalhes">
        conteúdo
      </Modal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("trava o scroll do body enquanto está aberto e liberta-o ao fechar", () => {
    const { unmount } = render(
      <Modal open onClose={vi.fn()} title="Detalhes">
        conteúdo
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
