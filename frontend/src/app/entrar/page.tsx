"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLoginModal } from "@/context/LoginModalContext";

/**
 * O login/registo já não é uma página: é um modal com fundo transparente.
 * Quem ainda chegar aqui (links antigos, e-mails) é levado para a home
 * com o modal de login aberto.
 */
export default function EntrarRedirect() {
  const router = useRouter();
  const { openLogin } = useLoginModal();

  useEffect(() => {
    openLogin();
    router.replace("/");
  }, [openLogin, router]);

  return null;
}
