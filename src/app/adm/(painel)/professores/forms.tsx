"use client";

import { Marcacoes } from "@/components/campos";
import { Formulario, type EstadoForm } from "@/components/form";
import { GradeHorarios, type Celula } from "@/components/grade";
import { Campo } from "@/components/ui";
import { salvarDisponibilidade, salvarProfessor } from "./actions";

export interface DadosProfessor {
  nome: string;
  email: string;
  telefone: string;
  idiomas: string;
  niveis: string;
  unidades: string[];
  ativo: boolean;
}

export function FormProfessor({ id, inicial, unidades }: { id: string | null; inicial: DadosProfessor; unidades: string[] }) {
  return (
    <Formulario acao={salvarProfessor.bind(null, id)} textoBotao={id ? "Salvar alterações" : "Cadastrar professor"} textoPendente="Salvando…">
      {(estado: EstadoForm) => {
        const v = { ...inicial, ...estado.valores };
        const unidadesMarcadas = estado.valores?.unidades !== undefined ? estado.valores.unidades.split("|").filter(Boolean) : inicial.unidades;
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="nome" name="nome" rotulo="Nome *" defaultValue={v.nome} required />
              <Campo id="email" name="email" type="email" rotulo="E-mail *" defaultValue={v.email} required />
              <Campo id="telefone" name="telefone" type="tel" rotulo="Telefone" defaultValue={v.telefone} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="idiomas" name="idiomas" rotulo="Idiomas que leciona *" defaultValue={v.idiomas} ajuda="Separe por vírgula. Ex.: Inglês, Espanhol" />
              <Campo id="niveis" name="niveis" rotulo="Níveis que leciona *" defaultValue={v.niveis} ajuda="Separe por vírgula. Ex.: Teens, Regular, Business" />
            </div>
            <Marcacoes
              legenda="Unidades onde atua *"
              nome="unidades"
              opcoes={unidades}
              marcadas={unidadesMarcadas}
              ajuda="Vínculos com unidades fora do seu escopo são preservados."
            />
            {id && (
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="ativo" defaultChecked={inicial.ativo} className="size-5" />
                Professor ativo
              </label>
            )}
          </>
        );
      }}
    </Formulario>
  );
}

export function FormDisponibilidade({
  id,
  disponiveis,
  aulas,
}: {
  id: string;
  disponiveis: Celula[];
  aulas: (Celula & { rotulo: string })[];
}) {
  return (
    <Formulario acao={salvarDisponibilidade.bind(null, id)} textoBotao="Salvar disponibilidade" textoPendente="Salvando…">
      <GradeHorarios
        nome="horarios"
        legenda="Horários em que o professor pode dar aula"
        ajuda="Clique para marcar ou desmarcar. Os códigos mostram as turmas ativas em cada horário; não é possível desmarcar um horário em uso."
        selecionados={disponiveis}
        ocupados={aulas}
      />
    </Formulario>
  );
}
