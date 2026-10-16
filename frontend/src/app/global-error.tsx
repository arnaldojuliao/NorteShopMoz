"use client";

/**
 * Fronteira de erro RAIZ — renderiza quando o próprio layout raiz falha.
 *
 * Substitui <html>/<body> (não herda o layout nem o CSS), por isso usa apenas
 * estilos inline: tem de ser legível mesmo sem folha de estilos nem tema.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#eef2f7",
          color: "#1e293b",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              margin: "0 auto",
              borderRadius: "1rem",
              background: "#dc2626",
              color: "#fff",
              fontSize: "1.5rem",
              lineHeight: "3.5rem",
            }}
            aria-hidden
          >
            !
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "1rem 0 0.5rem" }}>
            A NorteShopMoz não conseguiu carregar
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b", margin: 0 }}>
            Ocorreu um erro inesperado. Recarregue a página — se persistir,
            contacte o apoio ao cliente.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.7rem 1.5rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#155ceb",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
