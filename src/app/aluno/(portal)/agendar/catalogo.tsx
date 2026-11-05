"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alerta, Botao, cx } from "@/components/ui";
import { agendarReposicao } from "../reposicao-actions";

export interface Opcao {
  tipo: "TURMA" | "AVULSA";
  turma_id?: string;
  codigo?: string;
  nome?: string;
  idioma: string;
  nivel_curso: string;
  modalidade: string;
  professor: string;
  sala: string | null;
  vagas?: number;
}

export interface DiaCatalogo {
  data: string;
  horarios: { hora: number; opcoes: Opcao[] }[];
}

const HORAS = [8, 10, 12, 14, 16, 18, 20];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function titulo(data: string) {
  const [a, m, d] = data.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/**
 * Catálogo de horários em grade de 2 colunas; horários sem opção aparecem
 * como indisponíveis. A escolha abre um modal de confirmação com os detalhes.
 */
export function Catalogo({ dias }: { dias: DiaCatalogo[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [escolha, setEscolha] = useState<{ data: string; hora: number; opcao: Opcao } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const abrir = (data: string, hora: number, opcao: Opcao) => {
    setEscolha({ data, hora, opcao });
    setErro(null);
    dialogo.current?.showModal();
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {dias.map((d) => {
          const porHora = new Map(d.horarios.map((h) => [h.hora, h.opcoes]));
          return (
            <section key={d.data} aria-labelledby={`dia-${d.data}`}>
              <h2 id={`dia-${d.data}`} className="mb-2 text-base">
                {titulo(d.data)}
              </h2>
              <ul className="grid grid-cols-2 gap-2">
                {HORAS.map((h) => {
                  const opcoes = porHora.get(h) ?? [];
                  const op = opcoes[0];
                  const rotulo = `${String(h).padStart(2, "0")}h`;
                  return (
                    <li key={h}>
                      {op ? (
                        <button
                          type="button"
                          onClick={() => abrir(d.data, h, op)}
                          className="flex min-h-14 w-full flex-col items-start justify-center rounded-padrao border border-borda-campo bg-superficie px-3 py-2 text-left hover:border-destaque"
                        >
                          <span className="font-semibold tabular-nums">{rotulo}</span>
                          <span className="text-xs text-suave">
                            {op.tipo === "TURMA" ? `Turma ${op.codigo}` : "Aula individual"} · {op.modalidade}
                          </span>
                        </button>
                      ) : (
                        <div
                          aria-disabled="true"
                          className="flex min-h-14 w-full flex-col justify-center rounded-padrao border border-dashed border-borda px-3 py-2 text-suave"
                        >
                          <span className="font-semibold tabular-nums line-through">{rotulo}</span>
                          <span className="text-xs">Indisponível</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-confirmar"
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-padrao border border-borda bg-superficie p-5 text-texto backdrop:bg-black/50"
      >
        {escolha && (
          <>
            <h2 id="titulo-confirmar" className="text-lg">
              Confirmar reposição
            </h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-suave">Quando</dt>
              <dd className="font-semibold">
                {titulo(escolha.data)} às {String(escolha.hora).padStart(2, "0")}h
              </dd>
              <dt className="text-suave">Aula</dt>
              <dd>
                {escolha.opcao.tipo === "TURMA"
                  ? `Turma ${escolha.opcao.codigo} — ${escolha.opcao.nome}`
                  : `Aula individual de ${escolha.opcao.idioma} ${escolha.opcao.nivel_curso}`}
              </dd>
              <dt className="text-suave">Professor</dt>
              <dd>{escolha.opcao.professor}</dd>
              <dt className="text-suave">Local</dt>
              <dd>{escolha.opcao.modalidade === "Online" ? "Online" : escolha.opcao.sala}</dd>
            </dl>
            <p className="mt-4 text-sm text-suave">Será usado 1 crédito de reposição.</p>
            <div aria-live="polite" className="mt-3">
              {erro && <Alerta tipo="erro">{erro}</Alerta>}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Botao variante="secundario" disabled={pendente} onClick={() => dialogo.current?.close()}>
                Voltar
              </Botao>
              <Botao
                disabled={pendente}
                className={cx(pendente && "cursor-wait")}
                onClick={() =>
                  iniciar(async () => {
                    const r = await agendarReposicao({
                      data: escolha.data,
                      hora: escolha.hora,
                      tipo: escolha.opcao.tipo,
                      turmaId: escolha.opcao.turma_id ?? null,
                    });
                    if (r.ok) {
                      dialogo.current?.close();
                      router.push("/aluno?agendado=1");
                    } else {
                      setErro(r.erro);
                      router.refresh(); // recarrega o catálogo (a vaga pode ter acabado)
                    }
                  })
                }
              >
                {pendente ? "Agendando…" : "Confirmar"}
              </Botao>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
