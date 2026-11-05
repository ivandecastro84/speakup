"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alerta, Botao } from "@/components/ui";
import { cancelarReposicao } from "./reposicao-actions";

/** Cancelamento com confirmação; avisa quando o crédito será consumido. */
export function CancelarReposicao({ id, gratuito, antecedencia }: { id: string; gratuito: boolean; antecedencia: number }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="min-h-11 rounded-padrao px-3 text-sm font-semibold text-acento-texto hover:bg-acento-suave"
      >
        Cancelar
      </button>
      {erro && (
        <div className="mt-2">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      )}
      <dialog
        ref={dialogo}
        aria-labelledby={`cancelar-${id}`}
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-padrao border border-borda bg-superficie p-5 text-texto backdrop:bg-black/50"
      >
        <h2 id={`cancelar-${id}`} className="text-lg">
          Cancelar reposição?
        </h2>
        <p className="mt-2 text-sm text-suave">
          {gratuito
            ? `Você está cancelando com mais de ${antecedencia} h de antecedência: o crédito volta para o seu saldo.`
            : `Faltam menos de ${antecedencia} h para a aula: se cancelar agora, o crédito será consumido.`}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Botao variante="secundario" onClick={() => dialogo.current?.close()} disabled={pendente}>
            Voltar
          </Botao>
          <Botao
            variante="perigo"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await cancelarReposicao(id);
                dialogo.current?.close();
                if (r.ok) router.push(`/aluno?cancelada=${r.devolvido ? "devolvido" : "consumido"}`);
                else setErro(r.erro);
              })
            }
          >
            {pendente ? "Cancelando…" : "Cancelar reposição"}
          </Botao>
        </div>
      </dialog>
    </>
  );
}
