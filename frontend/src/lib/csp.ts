"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Utilitário para CSP nonce.
 * O nonce é gerado no servidor (middleware/headers) e injetado via meta tag.
 * Scripts inline devem usar este nonce para serem permitidos pelo CSP.
 */

export function useCspNonce(): string {
  const [nonce, setNonce] = useState("");

  useLayoutEffect(() => {
    // Lê o nonce do meta tag injetado pelo servidor
    const meta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
    if (meta) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNonce(meta.content);
    }
  }, []);

  return nonce;
}

/** Gera atributos de nonce para scripts inline. */
export function getNonceProps(nonce: string): React.HTMLAttributes<HTMLScriptElement> {
  return nonce ? { nonce } : {};
}

/** Hook para scripts que precisam de nonce (ex: theme script). */
export function useThemeScriptNonce() {
  const nonce = useCspNonce();
  return getNonceProps(nonce);
}