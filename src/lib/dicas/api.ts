/**
 * Cliente da API pública de dicas de inglês (Vibe Coding Lab).
 * Documentação: https://vibe-coding-frontend-backend.lovable.app/api/public/dicas/docs
 * GET sem autenticação, CORS liberado: chamada direto do navegador do aluno.
 */
export const URL_DICAS = "https://vibe-coding-frontend-backend.lovable.app/api/public/dicas";

export interface Dica {
  id: number;
  titulo: string;
  explicacao: string;
  exemplo_en: string;
  traducao_pt: string;
  nivel: string;
}

export const ROTULO_NIVEL: Record<string, string> = { iniciante: "Iniciante", intermediario: "Intermediário" };
export const rotuloNivel = (n: string) => ROTULO_NIVEL[n] ?? (n ? n[0].toUpperCase() + n.slice(1) : "—");

/** Valida o formato { total, dicas: [...] } e descarta itens incompletos. */
export function lerDicas(json: unknown): Dica[] {
  const lista = (json as { dicas?: unknown })?.dicas;
  if (!Array.isArray(lista)) throw new Error("FORMATO_INVALIDO");
  return lista.filter(
    (d): d is Dica =>
      d != null &&
      typeof d === "object" &&
      typeof (d as Dica).id === "number" &&
      typeof (d as Dica).titulo === "string" &&
      typeof (d as Dica).explicacao === "string" &&
      typeof (d as Dica).exemplo_en === "string" &&
      typeof (d as Dica).traducao_pt === "string",
  ).map((d) => ({ ...d, nivel: typeof d.nivel === "string" ? d.nivel : "" }));
}

export async function buscarDicas(sinal?: AbortSignal): Promise<Dica[]> {
  const res = await fetch(URL_DICAS, { signal: sinal, headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return lerDicas(await res.json());
}
