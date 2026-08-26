"use client";

import { useEffect } from "react";
import { useCspNonce } from "@/lib/csp";

/**
 * Script de inicialização do tema com suporte a CSP nonce.
 * Lê o nonce do meta tag injetado pelo middleware.
 */
export function ThemeScript() {
  const nonce = useCspNonce();

  useEffect(() => {
    // O script já executou no layout via dangerouslySetInnerHTML
    // Este componente garante que o nonce está disponível para hidratação
  }, [nonce]);

  // Retorna null — o script real está no layout.tsx com o nonce
  return null;
}

/** Props para o script de tema no layout. */
export function getThemeScriptProps(nonce: string) {
  return {
    nonce,
    dangerouslySetInnerHTML: {
      __html: `(function(){try{var r=localStorage.getItem("nsm:theme"),t=null;if(r){try{t=JSON.parse(r)}catch(e){t=r}}if(t!=="light"&&t!=="dark"&&t!=="system")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
    },
  };
}