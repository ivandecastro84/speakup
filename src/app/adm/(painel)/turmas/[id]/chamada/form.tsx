"use client";

import { Formulario } from "@/components/form";
import { EstadoVazio } from "@/components/ui";
import { salvarChamada } from "./actions";

interface Linha {
  id_aluno: string;
  nome: string;
  situacao: string | null;
  reposicao_id?: string;
}

function Opcoes({ nome, atual, rotulo }: { nome: string; atual: string | null; rotulo: string }) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{rotulo}</legend>
      {(["Presente", "Falta"] as const).map((s) => (
        <label
          key={s}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-padrao border border-borda px-3 text-sm has-[:checked]:border-transparent has-[:checked]:bg-destaque has-[:checked]:text-destaque-texto"
        >
          <input type="radio" name={nome} value={s} defaultChecked={atual === s} className="sr-only" />
          {s}
        </label>
      ))}
    </fieldset>
  );
}

export function FormChamada({
  turmaId,
  data,
  hora,
  regulares,
  reposicoes,
}: {
  turmaId: string;
  data: string;
  hora: number;
  regulares: Linha[];
  reposicoes: Linha[];
}) {
  if (regulares.length + reposicoes.length === 0) {
    return <EstadoVazio titulo="Nenhum aluno nesta aula" />;
  }
  return (
    <Formulario acao={salvarChamada.bind(null, turmaId, data, hora)} textoBotao="Salvar chamada" textoPendente="Salvando…">
      <ul className="divide-y divide-borda">
        {regulares.map((a) => (
          <li key={a.id_aluno} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{a.nome}</span> <span className="text-sm text-suave">{a.id_aluno}</span>
            </span>
            <Opcoes nome={`aluno:${a.id_aluno}`} atual={a.situacao} rotulo={`Presença de ${a.nome}`} />
          </li>
        ))}
        {reposicoes.map((a) => (
          <li key={a.reposicao_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{a.nome}</span>{" "}
              <span className="rounded-full bg-info-suave px-2 py-0.5 text-xs font-semibold text-info">Reposição</span>
            </span>
            <Opcoes nome={`repo:${a.reposicao_id}`} atual={a.situacao} rotulo={`Presença de ${a.nome} (reposição)`} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-suave">Alunos sem marcação não são alterados. Cada falta em aula regular gera 1 crédito de reposição.</p>
    </Formulario>
  );
}
