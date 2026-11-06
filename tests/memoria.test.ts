import { describe, expect, it } from "vitest";
import { type Estado, PARES_POR_JOGO, estadoInicial, reduzir, sortearPartida } from "@/lib/memoria/jogo";
import { VOCABULARIO } from "@/lib/memoria/vocabulario";

function novo(): Estado {
  const { pares, ordem } = sortearPartida();
  return estadoInicial(pares, ordem);
}
const posDoPar = (e: Estado, par: number) => e.cartas.filter((c) => c.par === par).map((c) => c.pos);
const umErro = (e: Estado) => {
  const a = e.cartas.find((c) => !e.encontrados.includes(c.par))!;
  const b = e.cartas.find((c) => c.par !== a.par && !e.encontrados.includes(c.par))!;
  return [a.pos, b.pos];
};

describe("Memory Game — regras", () => {
  it("monta 24 cartas (12 pares en/pt) embaralhadas, todas para baixo, situação iniciado", () => {
    const e = novo();
    expect(e.cartas).toHaveLength(24);
    for (let p = 0; p < PARES_POR_JOGO; p++) {
      expect(e.cartas.filter((c) => c.par === p).map((c) => c.idioma).sort()).toEqual(["en", "pt"]);
    }
    expect(e).toMatchObject({ viradas: [], encontrados: [], tentativas: 0, acertos: 0, pontos: 0, situacao: "iniciado" });
  });

  it("banco tem mais de 12 pares, sem palavras repetidas; sorteios variam", () => {
    expect(VOCABULARIO.length).toBeGreaterThanOrEqual(36);
    expect(new Set(VOCABULARIO.map((v) => v.en)).size).toBe(VOCABULARIO.length);
    const a = sortearPartida().pares.map((p) => p.en).join();
    const outros = Array.from({ length: 5 }, () => sortearPartida().pares.map((p) => p.en).join());
    expect(outros.some((o) => o !== a)).toBe(true);
  });

  it("acerto: mantém visível, +10, conta tentativa e acerto", () => {
    let e = novo();
    const [a, b] = posDoPar(e, 0);
    e = reduzir(e, { tipo: "VIRAR", pos: a });
    expect(e).toMatchObject({ viradas: [a], situacao: "em andamento", tentativas: 0 });
    e = reduzir(e, { tipo: "VIRAR", pos: b });
    expect(e).toMatchObject({ viradas: [], encontrados: [0], tentativas: 1, acertos: 1, pontos: 10, bloqueado: false });
    expect(e.ultima.origem).toBe("clique");
    expect(e.ultima.renderizados).toContain("Placar");
  });

  it("erro: −2 (sem negativo), bloqueia novos cliques até o temporizador desvirar", () => {
    let e = novo();
    const [x, y] = umErro(e);
    e = reduzir(reduzir(e, { tipo: "VIRAR", pos: x }), { tipo: "VIRAR", pos: y });
    expect(e).toMatchObject({ viradas: [x, y], tentativas: 1, acertos: 0, pontos: 0, bloqueado: true });
    const outra = e.cartas.find((c) => c.pos !== x && c.pos !== y)!.pos;
    expect(reduzir(e, { tipo: "VIRAR", pos: outra })).toBe(e); // clique ignorado
    e = reduzir(e, { tipo: "DESVIRAR" });
    expect(e).toMatchObject({ viradas: [], bloqueado: false });
    expect(e.ultima.origem).toBe("temporizador");
  });

  it("ignora clique na mesma carta e em par já encontrado; conclui com 12 pares", () => {
    let e = novo();
    const [a] = posDoPar(e, 0);
    e = reduzir(e, { tipo: "VIRAR", pos: a });
    expect(reduzir(e, { tipo: "VIRAR", pos: a })).toBe(e);
    e = reduzir(e, { tipo: "VIRAR", pos: posDoPar(e, 0)[1] });
    expect(reduzir(e, { tipo: "VIRAR", pos: a })).toBe(e);
    // erro com pontos positivos desconta 2
    const [x, y] = umErro(e);
    e = reduzir(reduzir(e, { tipo: "VIRAR", pos: x }), { tipo: "VIRAR", pos: y });
    expect(e.pontos).toBe(8);
    e = reduzir(e, { tipo: "DESVIRAR" });
    for (let p = 1; p < PARES_POR_JOGO; p++) {
      const [m, n] = posDoPar(e, p);
      e = reduzir(reduzir(e, { tipo: "VIRAR", pos: m }), { tipo: "VIRAR", pos: n });
    }
    expect(e).toMatchObject({ situacao: "concluído", acertos: 12, tentativas: 13, pontos: 118 });
    expect(e.ultima.renderizados).toContain("Mensagem de vitória");
    expect(reduzir(e, { tipo: "VIRAR", pos: 0 })).toBe(e);
  });

  it("Novo Jogo zera tudo e volta para iniciado", () => {
    let e = novo();
    const [a, b] = posDoPar(e, 3);
    e = reduzir(reduzir(e, { tipo: "VIRAR", pos: a }), { tipo: "VIRAR", pos: b });
    const { pares, ordem } = sortearPartida();
    e = reduzir(e, { tipo: "NOVO_JOGO", pares, ordem });
    expect(e).toMatchObject({ encontrados: [], tentativas: 0, pontos: 0, situacao: "iniciado" });
    expect(e.ultima.origem).toBe("botão Novo Jogo");
  });
});
