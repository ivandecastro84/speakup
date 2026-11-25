"use client";

import { useRef, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { registrarInteresse } from "./oferta-actions";

export interface Oferta {
  campanha_id: string;
  titulo: string;
  mensagem: string;
  desconto: number;
  data_fim: string;
  interesse_em: string | null;
}

const br = (d: string) => d.split("-").reverse().join("/");
const LIMIAR_RASGO = 70; // px arrastados para rasgar

/** Borda rasgada (zigue-zague) do lado direito do ingresso depois que o canhoto sai. */
const BORDA_RASGADA = (() => {
  const dentes = 18;
  const pts = ["0 0", "calc(100% - 10px) 0"];
  for (let i = 1; i <= dentes; i++) pts.push(`${i % 2 ? "100%" : "calc(100% - 10px)"} ${((i / dentes) * 100).toFixed(2)}%`);
  pts.push("0 100%");
  return `polygon(${pts.join(", ")})`;
})();

/**
 * Oferta da campanha de retenção como um ingresso de disponibilidade única.
 * Rasgar o canhoto (arrastando, tocando ou pelo teclado) registra o interesse;
 * depois de rasgado, o ingresso fica carimbado "GARANTIDO" e não volta.
 */
export function CartaoOferta({ oferta }: { oferta: Oferta }) {
  const [garantidoEm, setGarantidoEm] = useState<string | null>(oferta.interesse_em);
  const [dx, setDx] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [voando, setVoando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const inicio = useRef<{ x: number; id: number } | null>(null);
  const moveu = useRef(false);
  const desconto = Number(oferta.desconto).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const serie = oferta.campanha_id.replace(/-/g, "").slice(0, 8).toUpperCase();

  function rasgar() {
    setConfirmar(false);
    setErro(null);
    setVoando(true);
    iniciar(async () => {
      const r = await registrarInteresse(oferta.campanha_id);
      if (r.ok) {
        // espera a animação do canhoto terminar antes de carimbar
        setTimeout(() => setGarantidoEm(new Date().toISOString()), 350);
      } else {
        setVoando(false);
        setDx(0);
        setErro(r.erro);
      }
    });
  }

  function aoPressionar(e: React.PointerEvent) {
    if (pendente || voando) return;
    inicio.current = { x: e.clientX, id: e.pointerId };
    moveu.current = false;
    setArrastando(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function aoMover(e: React.PointerEvent) {
    if (!inicio.current || inicio.current.id !== e.pointerId) return;
    const d = Math.max(0, e.clientX - inicio.current.x);
    if (d > 6) moveu.current = true;
    setDx(d);
  }
  function aoSoltar(e: React.PointerEvent) {
    if (!inicio.current || inicio.current.id !== e.pointerId) return;
    inicio.current = null;
    setArrastando(false);
    if (dx >= LIMIAR_RASGO) rasgar();
    else {
      setDx(0);
      if (!moveu.current) setConfirmar(true); // toque simples → confirmar
    }
  }

  const rasgado = Boolean(garantidoEm);
  const progresso = Math.min(dx / LIMIAR_RASGO, 1);

  return (
    <section aria-labelledby="titulo-oferta" className="relative select-none">
      <div className="flex drop-shadow-lg">
        {/* Corpo do ingresso */}
        <div
          className="relative min-w-0 flex-1 overflow-hidden rounded-l-padrao bg-linear-to-br from-amber-400 via-pink-500 to-violet-600 p-4 pr-5 text-white"
          style={rasgado ? { clipPath: BORDA_RASGADA, borderRadius: "var(--raio) 0 0 var(--raio)" } : undefined}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/85">Ingresso único · Speak Up</p>
          <h2 id="titulo-oferta" className="mt-1 text-lg font-extrabold leading-tight sm:text-xl">{oferta.titulo}</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-white/95">{oferta.mensagem}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2 text-[11px] font-semibold text-white/90">
            <span>
              {desconto}% na rematrícula antecipada
              <br />
              Válido até {br(oferta.data_fim)}
            </span>
            <span className="font-mono tracking-widest">Nº {serie}</span>
          </div>

          {rasgado && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="memoria-render -rotate-12 rounded-lg border-4 border-white px-4 py-1 text-2xl font-black tracking-widest text-white opacity-90 shadow-sm">
                GARANTIDO ✓
              </span>
            </div>
          )}
        </div>

        {/* Canhoto (picotado) */}
        {!rasgado && (
          <div className="relative w-[30%] max-w-32 shrink-0">
            {/* picote: linha tracejada + meia-luas */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 left-0 z-10 border-l-2 border-dashed border-white/70" />
            <span aria-hidden="true" className="pointer-events-none absolute -left-2.5 -top-2.5 z-10 size-5 rounded-full bg-fundo" />
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-2.5 -left-2.5 z-10 size-5 rounded-full bg-fundo" />
            <button
              type="button"
              aria-label={`Rasgar o canhoto para garantir ${desconto}% de desconto na rematrícula`}
              aria-describedby="dica-canhoto"
              disabled={pendente}
              onPointerDown={aoPressionar}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onPointerCancel={aoSoltar}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setConfirmar(true);
                }
              }}
              style={{
                transform: voando
                  ? "translateX(140%) translateY(30px) rotate(25deg)"
                  : `translateX(${dx}px) rotate(${progresso * 8}deg)`,
                opacity: voando ? 0 : 1,
                transition: arrastando ? "none" : "transform 0.45s cubic-bezier(.3,.7,.4,1), opacity 0.45s",
                touchAction: "pan-y",
              }}
              className={cx(
                "flex size-full origin-bottom-left cursor-grab flex-col items-center justify-center gap-1 rounded-r-padrao bg-linear-to-b from-violet-600 to-fuchsia-600 px-2 py-3 text-center text-white active:cursor-grabbing",
                "motion-reduce:transition-none",
              )}
            >
              <span className="text-2xl font-black leading-none sm:text-3xl">−{desconto}%</span>
              <span className="text-[10px] font-bold uppercase leading-tight tracking-wider">
                Rasgue
                <br />
                para garantir
              </span>
              <span aria-hidden="true" className={cx("text-lg transition-transform", progresso > 0 && "translate-x-1")}>
                ✂︎ →
              </span>
            </button>
          </div>
        )}
      </div>

      <p id="dica-canhoto" className="sr-only">
        Arraste o canhoto para a direita, toque nele ou pressione Enter. A oferta é única: depois de rasgado, o canhoto não volta.
      </p>

      <div aria-live="polite" className="mt-2">
        {confirmar && !rasgado && (
          <div role="alertdialog" aria-labelledby="pergunta-rasgar" className="flex flex-wrap items-center gap-2 rounded-padrao border border-borda bg-superficie p-3">
            <p id="pergunta-rasgar" className="flex-1 text-sm font-semibold">Rasgar o canhoto e garantir {desconto}% de desconto?</p>
            <button type="button" onClick={rasgar} autoFocus className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-bold text-destaque-texto">
              Rasgar e garantir
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className="min-h-11 rounded-padrao border border-borda px-4 text-sm">
              Agora não
            </button>
          </div>
        )}
        {rasgado && (
          <p role="status" className="text-sm font-semibold text-sucesso">
            ✓ Desconto garantido{garantidoEm ? ` em ${new Date(garantidoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}! A equipe da sua
            unidade vai entrar em contato para concluir a rematrícula.
          </p>
        )}
        {!rasgado && !confirmar && !erro && (
          <p className="text-xs text-suave">Arraste o canhoto para a direita (ou toque nele) para garantir. Oferta única.</p>
        )}
        {erro && <p role="alert" className="text-sm font-semibold text-erro">{erro}</p>}
      </div>
    </section>
  );
}
