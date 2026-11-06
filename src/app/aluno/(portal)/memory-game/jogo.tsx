"use client";

import { useEffect, useReducer, useRef } from "react";
import { cx } from "@/components/ui";
import {
  ATRASO_DESVIRAR_MS,
  type Carta,
  type Estado,
  PARES_POR_JOGO,
  estadoInicial,
  reduzir,
  sortearPartida,
} from "@/lib/memoria/jogo";
import type { Par } from "@/lib/memoria/vocabulario";

const COR_SITUACAO: Record<Estado["situacao"], string> = {
  iniciado: "bg-sky-500",
  "em andamento": "bg-amber-500",
  concluído: "bg-emerald-500",
};

export function JogoMemoria({ pares, ordem }: { pares: Par[]; ordem: number[] }) {
  const [e, despachar] = useReducer(reduzir, undefined, () => estadoInicial(pares, ordem));
  const renders = useRef(0);
  renders.current += 1;

  // Reatividade: par errado à mostra → depois de 1 s o temporizador desvira.
  useEffect(() => {
    if (!e.bloqueado) return;
    const t = setTimeout(() => despachar({ tipo: "DESVIRAR" }), ATRASO_DESVIRAR_MS);
    return () => clearTimeout(t);
  }, [e.bloqueado]);

  // O que foi re-renderizado nesta atualização (para destacar na tela).
  const alvo = (nome: string) => e.ultima.renderizados.some((r) => r.startsWith(nome));
  const posMudadas = new Set(
    e.ultima.renderizados.filter((r) => r.startsWith("Carta")).flatMap((r) => (r.match(/\d+/g) ?? []).map((n) => Number(n) - 1)),
  );

  const novoJogo = () => {
    const p = sortearPartida();
    despachar({ tipo: "NOVO_JOGO", pares: p.pares, ordem: p.ordem });
  };

  const selecionadas = e.viradas.map((p) => e.cartas[p]);

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de indicadores */}
      <div className="grid grid-cols-4 gap-2 text-center text-white">
        <Indicador rotulo="Pontos" valor={e.pontos} cor="from-pink-500 to-rose-500" destaque={alvo("Placar")} chave={e.ultima.n} />
        <Indicador rotulo="Tentativas" valor={e.tentativas} cor="from-violet-500 to-indigo-500" destaque={alvo("Tentativas")} chave={e.ultima.n} />
        <Indicador rotulo="Acertos" valor={`${e.acertos}/${PARES_POR_JOGO}`} cor="from-emerald-500 to-teal-500" destaque={alvo("Acertos")} chave={e.ultima.n} />
        <div
          key={`sit-${alvo("Situação") ? e.ultima.n : 0}`}
          className={cx("flex flex-col justify-center rounded-padrao p-2 shadow", COR_SITUACAO[e.situacao], alvo("Situação") && "memoria-render")}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/85">Situação</span>
          <span className="text-[13px] font-bold leading-tight first-letter:uppercase">{e.situacao}</span>
        </div>
      </div>

      {/* Tabuleiro 5×5: 24 cartas + placar na 25ª posição */}
      <div
        role="grid"
        aria-label="Tabuleiro do jogo da memória, 5 por 5"
        aria-disabled={e.bloqueado}
        className={cx("grid grid-cols-5 gap-1.5 sm:gap-2", e.bloqueado && "cursor-wait")}
      >
        {e.cartas.map((c) => {
          const encontrada = e.encontrados.includes(c.par);
          const aberta = encontrada || e.viradas.includes(c.pos);
          const errada = e.bloqueado && e.viradas.includes(c.pos);
          return (
            <div key={`${e.ultima.origem === "botão Novo Jogo" ? e.ultima.n : 0}-${c.pos}`} role="gridcell" className="aspect-square">
              <button
                type="button"
                data-aberta={aberta}
                onClick={() => despachar({ tipo: "VIRAR", pos: c.pos })}
                disabled={encontrada}
                aria-label={
                  aberta
                    ? `Carta ${c.pos + 1}: ${c.texto} (${c.idioma === "en" ? "inglês" : "português"})${encontrada ? ", par encontrado" : ""}`
                    : `Carta ${c.pos + 1}, virada para baixo`
                }
                className={cx(
                  "memoria-carta relative size-full rounded-xl",
                  errada && "memoria-tremer",
                  e.bloqueado && !aberta && "opacity-80",
                )}
              >
                {posMudadas.has(c.pos) && (
                  <span key={e.ultima.n} aria-hidden="true" className="memoria-render pointer-events-none absolute inset-0 z-10 rounded-xl" />
                )}
                <span className="memoria-giro block">
                  {/* Verso */}
                  <span className="memoria-face flex items-center justify-center rounded-xl bg-linear-to-br from-fuchsia-500 via-violet-500 to-indigo-600 text-2xl font-black text-white/90 shadow-md ring-2 ring-white/20 sm:text-3xl">
                    ?
                  </span>
                  {/* Frente */}
                  <span
                    className={cx(
                      "memoria-face memoria-frente flex flex-col items-center justify-center gap-0.5 rounded-xl p-1 text-center text-white shadow-md",
                      encontrada
                        ? "bg-linear-to-br from-emerald-400 to-teal-600 ring-2 ring-emerald-200"
                        : c.idioma === "en"
                          ? "bg-linear-to-br from-sky-400 to-blue-600"
                          : "bg-linear-to-br from-amber-400 to-orange-600",
                    )}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/85 sm:text-[10px]">
                      {encontrada ? "✓ par" : c.idioma === "en" ? "EN" : "PT"}
                    </span>
                    <span
                      lang={c.idioma === "en" ? "en" : "pt-BR"}
                      className="break-words text-[11px] font-bold leading-tight [hyphens:auto] sm:text-sm"
                    >
                      {c.texto}
                    </span>
                  </span>
                </span>
              </button>
            </div>
          );
        })}

        {/* 25ª posição: placar */}
        <div role="gridcell" className="aspect-square">
          <div
            key={`placar-${alvo("Placar") ? e.ultima.n : 0}`}
            aria-label={`Pontuação: ${e.pontos} pontos`}
            className={cx(
              "flex size-full flex-col items-center justify-center rounded-xl bg-linear-to-br from-yellow-300 via-amber-400 to-pink-500 text-center text-slate-900 shadow-md ring-2 ring-yellow-200",
              alvo("Placar") && "memoria-render",
            )}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider sm:text-[10px]">★ Pontos</span>
            <span className="text-xl font-black tabular-nums leading-none sm:text-3xl">{e.pontos}</span>
            <span className="text-[9px] font-semibold sm:text-[10px]">{e.tentativas} tent.</span>
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {e.ultima.descricao}
      </p>

      {/* Vitória */}
      {e.situacao === "concluído" && (
        <div
          key={`vit-${e.ultima.n}`}
          className="memoria-render rounded-padrao bg-linear-to-r from-emerald-500 via-teal-500 to-sky-500 p-5 text-center text-white shadow-lg"
        >
          <p className="text-3xl" aria-hidden="true">🎉🏆🎉</p>
          <p className="mt-1 text-xl font-bold">Parabéns! Você encontrou os {PARES_POR_JOGO} pares!</p>
          <p className="mt-1">
            {e.pontos} pontos em {e.tentativas} tentativas
            {e.tentativas === PARES_POR_JOGO ? " — perfeito, sem nenhum erro!" : "."}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={novoJogo}
        className="min-h-12 w-full rounded-padrao bg-linear-to-r from-pink-500 via-fuchsia-500 to-violet-500 px-5 text-lg font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.99]"
      >
        Novo Jogo
      </button>

      <PainelDidatico e={e} selecionadas={selecionadas} renders={renders.current} />
    </div>
  );
}

function Indicador({ rotulo, valor, cor, destaque, chave }: { rotulo: string; valor: string | number; cor: string; destaque: boolean; chave: number }) {
  return (
    <div
      key={destaque ? chave : 0}
      className={cx("flex flex-col justify-center rounded-padrao bg-linear-to-br p-2 shadow", cor, destaque && "memoria-render")}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-white/85">{rotulo}</span>
      <span className="text-xl font-black tabular-nums leading-tight">{valor}</span>
    </div>
  );
}

/** Painel "Como o FrontEnd funciona": Estado → Renderização → Reatividade, em tempo real. */
function PainelDidatico({ e, selecionadas, renders }: { e: Estado; selecionadas: Carta[]; renders: number }) {
  return (
    <section aria-labelledby="titulo-frontend" className="rounded-padrao border-2 border-dashed border-violet-400 p-4">
      <h2 id="titulo-frontend" className="text-lg">
        Como o FrontEnd funciona
      </h2>
      <p className="mt-1 text-sm text-suave">
        Cada clique gera um <strong>evento</strong> → o evento muda o <strong>estado</strong> → o React <strong>renderiza</strong> de novo
        só o que mudou. Os elementos atualizados piscam em amarelo no jogo.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <Bloco titulo="1. Estado" cor="border-sky-500" etiqueta="o que o jogo lembra">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-suave">Cartas selecionadas</dt>
            <dd className="font-mono">
              {selecionadas.length === 0 ? "nenhuma" : selecionadas.map((c) => `#${c.pos + 1} “${c.texto}”`).join(" + ")}
            </dd>
            <dt className="text-suave">Pares encontrados</dt>
            <dd className="font-mono">
              {e.encontrados.length}/{PARES_POR_JOGO}
            </dd>
            <dt className="text-suave">Pontuação</dt>
            <dd className="font-mono">{e.pontos}</dd>
            <dt className="text-suave">Tentativas · acertos</dt>
            <dd className="font-mono">
              {e.tentativas} · {e.acertos}
            </dd>
            <dt className="text-suave">Situação</dt>
            <dd className="font-mono">{e.situacao}</dd>
            <dt className="text-suave">Bloqueado</dt>
            <dd className="font-mono">{e.bloqueado ? "sim (par errado à mostra)" : "não"}</dd>
          </dl>
        </Bloco>

        <Bloco titulo="2. Renderização" cor="border-amber-500" etiqueta="o que a tela redesenhou">
          <ul className="flex flex-wrap gap-1.5">
            {e.ultima.renderizados.map((r) => (
              <li key={r} className="rounded-full bg-amber-400/30 px-2.5 py-1 text-xs font-semibold text-texto">
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-suave">O componente do jogo já foi renderizado {renders} vez(es) nesta visita.</p>
        </Bloco>

        <Bloco titulo="3. Reatividade" cor="border-emerald-500" etiqueta="o que provocou a atualização">
          <p className="text-sm">
            <span className="mr-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">#{e.ultima.n} · {e.ultima.origem}</span>
            {e.ultima.descricao}
          </p>
          {e.historico.length > 1 && (
            <ol className="mt-2 flex flex-col gap-1 text-xs text-suave">
              {e.historico.slice(1).map((h) => (
                <li key={h.n}>
                  #{h.n} · {h.origem}: {h.descricao}
                </li>
              ))}
            </ol>
          )}
        </Bloco>
      </div>
    </section>
  );
}

function Bloco({ titulo, cor, etiqueta, children }: { titulo: string; cor: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className={cx("rounded-padrao border-l-4 bg-superficie p-3", cor)}>
      <p className="mb-2 text-sm font-bold">
        {titulo} <span className="font-normal text-suave">— {etiqueta}</span>
      </p>
      {children}
    </div>
  );
}
