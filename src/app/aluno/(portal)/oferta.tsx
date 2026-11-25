"use client";

import { useState, useTransition } from "react";
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

/** Destaque da campanha de retenção no topo do Início (título e mensagem já personalizados). */
export function CartaoOferta({ oferta }: { oferta: Oferta }) {
  const [pendente, iniciar] = useTransition();
  const [interesse, setInteresse] = useState(Boolean(oferta.interesse_em));
  const [erro, setErro] = useState<string | null>(null);
  const desconto = Number(oferta.desconto).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <section
      aria-labelledby="titulo-oferta"
      className="overflow-hidden rounded-padrao bg-linear-to-br from-amber-400 via-pink-500 to-violet-600 p-5 text-white shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="titulo-oferta" className="text-xl font-extrabold leading-tight">{oferta.titulo}</h2>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-extrabold text-pink-600 shadow">−{desconto}%</span>
      </div>
      <p className="mt-2 whitespace-pre-line text-white/95">{oferta.mensagem}</p>
      <p className="mt-3 text-sm font-semibold text-white/90">
        {desconto}% de desconto na rematrícula antecipada · válido até {br(oferta.data_fim)}
      </p>
      <div className="mt-4" aria-live="polite">
        {interesse ? (
          <p role="status" className="rounded-padrao bg-white/20 px-4 py-3 font-semibold">
            ✓ Interesse registrado! A equipe da sua unidade vai entrar em contato para concluir a rematrícula.
          </p>
        ) : (
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await registrarInteresse(oferta.campanha_id);
                if (r.ok) setInteresse(true);
                else setErro(r.erro);
              })
            }
            className="min-h-12 w-full rounded-padrao bg-white px-5 text-lg font-bold text-pink-600 shadow transition hover:bg-white/90 disabled:opacity-70"
          >
            {pendente ? "Registrando…" : "Tenho interesse"}
          </button>
        )}
        {erro && <p role="alert" className="mt-2 rounded-padrao bg-white/90 px-3 py-2 text-sm font-semibold text-red-700">{erro}</p>}
      </div>
    </section>
  );
}
