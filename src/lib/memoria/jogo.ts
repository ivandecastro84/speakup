/**
 * Memory Game: estado e regras (funções puras).
 * O componente React só despacha ações; toda mudança de estado passa por aqui,
 * o que deixa visível a separação Estado → Renderização → Reatividade.
 */
import { type Par, VOCABULARIO } from "./vocabulario";

export const PARES_POR_JOGO = 12;
export const PONTOS_ACERTO = 10;
export const PONTOS_ERRO = -2;
export const ATRASO_DESVIRAR_MS = 1000;

export type Situacao = "iniciado" | "em andamento" | "concluído";

export interface Carta {
  /** posição no tabuleiro (0–23) */
  pos: number;
  par: number;
  idioma: "en" | "pt";
  texto: string;
  tema: string;
}

export interface Acao {
  /** O que o jogador (ou o temporizador) fez. */
  origem: "clique" | "temporizador" | "botão Novo Jogo" | "carregamento";
  descricao: string;
  /** Elementos da tela que mudaram por causa dessa ação. */
  renderizados: string[];
  /** Número sequencial, para o painel didático. */
  n: number;
}

export interface Estado {
  cartas: Carta[];
  /** posições viradas e ainda não resolvidas (0, 1 ou 2) */
  viradas: number[];
  /** índices de par já encontrados */
  encontrados: number[];
  tentativas: number;
  acertos: number;
  pontos: number;
  situacao: Situacao;
  /** true enquanto um par errado está à mostra (1 s) */
  bloqueado: boolean;
  ultima: Acao;
  historico: Acao[];
}

export type Evento =
  | { tipo: "NOVO_JOGO"; pares: Par[]; ordem: number[] }
  | { tipo: "VIRAR"; pos: number }
  | { tipo: "DESVIRAR" };

/** Fisher–Yates com gerador injetável (testável). */
export function embaralhar<T>(lista: T[], aleatorio: () => number = Math.random): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorteia 12 pares do banco e uma ordem aleatória para as 24 cartas. */
export function sortearPartida(aleatorio: () => number = Math.random) {
  const pares = embaralhar(VOCABULARIO, aleatorio).slice(0, PARES_POR_JOGO);
  const ordem = embaralhar(Array.from({ length: PARES_POR_JOGO * 2 }, (_, i) => i), aleatorio);
  return { pares, ordem };
}

function montarCartas(pares: Par[], ordem: number[]): Carta[] {
  // carta k: par = floor(k/2), k par = inglês, k ímpar = português
  const base = pares.flatMap((p, i) => [
    { par: i, idioma: "en" as const, texto: p.en, tema: p.tema },
    { par: i, idioma: "pt" as const, texto: p.pt, tema: p.tema },
  ]);
  return ordem.map((k, pos) => ({ pos, ...base[k] }));
}

function registrar(e: Estado, a: Omit<Acao, "n">): Pick<Estado, "ultima" | "historico"> {
  const ultima = { ...a, n: e.ultima.n + 1 };
  return { ultima, historico: [ultima, ...e.historico].slice(0, 6) };
}

export function estadoInicial(pares: Par[], ordem: number[], n = 0): Estado {
  const ultima: Acao = {
    origem: n === 0 ? "carregamento" : "botão Novo Jogo",
    descricao: "Cartas sorteadas e embaralhadas; todas viradas para baixo.",
    renderizados: ["25 posições do tabuleiro", "Placar", "Tentativas", "Situação"],
    n: n + 1,
  };
  return {
    cartas: montarCartas(pares, ordem),
    viradas: [],
    encontrados: [],
    tentativas: 0,
    acertos: 0,
    pontos: 0,
    situacao: "iniciado",
    bloqueado: false,
    ultima,
    historico: [ultima],
  };
}

const nomeCarta = (c: Carta) => `carta ${c.pos + 1} “${c.texto}”`;

export function reduzir(e: Estado, ev: Evento): Estado {
  switch (ev.tipo) {
    case "NOVO_JOGO": {
      const novo = estadoInicial(ev.pares, ev.ordem, e.ultima.n);
      return { ...novo, historico: [novo.ultima, ...e.historico].slice(0, 6) };
    }

    case "VIRAR": {
      const c = e.cartas[ev.pos];
      // Cliques ignorados: bloqueado, jogo concluído, carta já virada ou já encontrada.
      if (!c || e.bloqueado || e.situacao === "concluído" || e.viradas.includes(ev.pos) || e.encontrados.includes(c.par)) {
        return e;
      }
      const viradas = [...e.viradas, ev.pos];

      // Primeira carta do par.
      if (viradas.length === 1) {
        return {
          ...e,
          viradas,
          situacao: "em andamento",
          ...registrar(e, {
            origem: "clique",
            descricao: `Clique na ${nomeCarta(c)}: primeira carta da jogada.`,
            renderizados: [`Carta ${c.pos + 1} (virou)`, ...(e.situacao === "iniciado" ? ["Situação"] : [])],
          }),
        };
      }

      // Segunda carta: verifica automaticamente.
      const a = e.cartas[viradas[0]];
      const tentativas = e.tentativas + 1;
      if (a.par === c.par) {
        const encontrados = [...e.encontrados, c.par];
        const acertos = e.acertos + 1;
        const concluido = encontrados.length === PARES_POR_JOGO;
        return {
          ...e,
          viradas: [],
          encontrados,
          tentativas,
          acertos,
          pontos: e.pontos + PONTOS_ACERTO,
          situacao: concluido ? "concluído" : "em andamento",
          ...registrar(e, {
            origem: "clique",
            descricao: `Clique na ${nomeCarta(c)}: formou par com “${a.texto}”. +${PONTOS_ACERTO} pontos.`,
            renderizados: [
              `Cartas ${a.pos + 1} e ${c.pos + 1} (par encontrado)`,
              "Placar",
              "Tentativas",
              "Acertos",
              ...(concluido ? ["Situação", "Mensagem de vitória"] : []),
            ],
          }),
        };
      }
      return {
        ...e,
        viradas,
        tentativas,
        pontos: Math.max(0, e.pontos + PONTOS_ERRO),
        bloqueado: true,
        ...registrar(e, {
          origem: "clique",
          descricao: `Clique na ${nomeCarta(c)}: não forma par com “${a.texto}”. ${PONTOS_ERRO} pontos; tabuleiro bloqueado por 1 s.`,
          renderizados: [`Carta ${c.pos + 1} (virou)`, "Placar", "Tentativas", "Tabuleiro (bloqueado)"],
        }),
      };
    }

    case "DESVIRAR": {
      if (!e.bloqueado) return e;
      return {
        ...e,
        viradas: [],
        bloqueado: false,
        ...registrar(e, {
          origem: "temporizador",
          descricao: "Passou 1 segundo: o par errado voltou a ficar virado para baixo.",
          renderizados: [`Cartas ${e.viradas.map((p) => p + 1).join(" e ")} (desviraram)`, "Tabuleiro (liberado)"],
        }),
      };
    }
  }
}
