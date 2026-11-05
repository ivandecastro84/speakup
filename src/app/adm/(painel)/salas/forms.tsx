"use client";

import { Selecao } from "@/components/campos";
import { Formulario, type EstadoForm } from "@/components/form";
import { Campo } from "@/components/ui";
import { salvarSala } from "./actions";

export function FormSala({
  sala,
  unidades,
}: {
  sala: { id: string; nome: string; unidade: string; capacidade: number; ativa: boolean } | null;
  unidades: string[];
}) {
  const pre = sala?.id ?? "nova";
  return (
    <Formulario acao={salvarSala.bind(null, sala?.id ?? null)} textoBotao={sala ? "Salvar sala" : "Cadastrar sala"} textoPendente="Salvando…">
      {(estado: EstadoForm) => {
        const v = { nome: sala?.nome ?? "", unidade: sala?.unidade ?? (unidades.length === 1 ? unidades[0] : ""), capacidade: String(sala?.capacidade ?? ""), ...estado.valores };
        return (
          <>
            <Selecao id={`${pre}-unidade`} name="unidade" rotulo="Unidade *" opcoes={unidades} vazio="Selecione…" defaultValue={v.unidade} />
            <Campo id={`${pre}-nome`} name="nome" rotulo="Nome da sala *" defaultValue={v.nome} />
            <Campo id={`${pre}-capacidade`} name="capacidade" rotulo="Capacidade (lugares) *" inputMode="numeric" defaultValue={v.capacidade} />
            {sala && (
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="ativa" defaultChecked={sala.ativa} className="size-5" />
                Sala ativa
              </label>
            )}
          </>
        );
      }}
    </Formulario>
  );
}
