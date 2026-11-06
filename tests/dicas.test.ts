import { describe, expect, it } from "vitest";
import { lerDicas, rotuloNivel } from "@/lib/dicas/api";

describe("Dicas de inglês (API externa)", () => {
  it("lê o formato documentado e descarta itens incompletos", () => {
    const d = lerDicas({
      total: 3,
      dicas: [
        { id: 1, titulo: "T", explicacao: "E", exemplo_en: "Hi", traducao_pt: "Oi", nivel: "iniciante" },
        { id: 2, titulo: "Sem exemplo" },
        { id: 3, titulo: "T3", explicacao: "E3", exemplo_en: "Go", traducao_pt: "Vá", nivel: null },
      ],
    });
    expect(d.map((x) => x.id)).toEqual([1, 3]);
    expect(d[1].nivel).toBe("");
  });
  it("recusa resposta fora do formato", () => {
    expect(() => lerDicas({ erro: "x" })).toThrow("FORMATO_INVALIDO");
    expect(() => lerDicas(null)).toThrow();
  });
  it("rótulos de nível", () => {
    expect(rotuloNivel("iniciante")).toBe("Iniciante");
    expect(rotuloNivel("intermediario")).toBe("Intermediário");
    expect(rotuloNivel("avancado")).toBe("Avancado");
  });
});
