import { ImageResponse } from "next/og";

/** Ícones placeholder do PWA (H.5): monograma "SU" sobre o azul da marca. */
const TAMANHOS: Record<string, { lado: number; margem: number }> = {
  "192.png": { lado: 192, margem: 0 },
  "512.png": { lado: 512, margem: 0 },
  "maskable-512.png": { lado: 512, margem: 0.2 },
  "apple-180.png": { lado: 180, margem: 0 },
};

export const dynamic = "force-static";
export const generateStaticParams = () => Object.keys(TAMANHOS).map((arquivo) => ({ arquivo }));

export async function GET(_: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const t = TAMANHOS[(await params).arquivo];
  if (!t) return new Response("Não encontrado", { status: 404 });
  const util = t.lado * (1 - t.margem * 2);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#08112a" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: util,
            height: util,
            borderRadius: util * 0.22,
            background: "#08112a",
            border: `${Math.round(util * 0.04)}px solid #e63946`,
            color: "#ffffff",
            fontSize: util * 0.42,
            fontWeight: 700,
            letterSpacing: -util * 0.01,
          }}
        >
          SU
        </div>
      </div>
    ),
    { width: t.lado, height: t.lado },
  );
}
