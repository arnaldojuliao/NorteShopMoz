import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fontData = readFileSync(
  join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf")
);
// Logo real (public/logo.png) embutido como data URI — a marca aparece no preview.
const logoData = readFileSync(join(process.cwd(), "public/logo.png"));
const LOGO_URI = `data:image/png;base64,${logoData.toString("base64")}`;

export const alt =
  "NorteShop — Compras simples, seguras e acessíveis em Moçambique";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #0b1030 0%, #15215e 55%, #1f46e6 130%)",
          color: "#ffffff",
          fontFamily: "Geist",
        }}
      >
        {/* topo: marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={LOGO_URI} width={64} height={64} alt="" style={{ borderRadius: 18 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
              NorteShop
            </span>
            <span style={{ fontSize: 18, opacity: 0.75, marginTop: 2 }}>
              Loja online moçambicana
            </span>
          </div>
        </div>

        {/* centro: mensagem */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <span
            style={{
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -2,
            }}
          >
            Compras simples, seguras e acessíveis
          </span>
          <span
            style={{
              fontSize: 26,
              opacity: 0.85,
              marginTop: 20,
              maxWidth: 720,
              lineHeight: 1.4,
            }}
          >
            Eletrónica, moda, casa, beleza e muito mais. Entrega para todo o
            Moçambique e pagamento na entrega.
          </span>
        </div>

        {/* rodapé: selos */}
        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 20,
            opacity: 0.85,
          }}
        >
          <span>Entrega em todas as províncias</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Pagamento na entrega</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Garantia de 6 meses</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Geist", data: fontData, weight: 400 }],
    }
  );
}
