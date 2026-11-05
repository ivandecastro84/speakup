"use client";

import { Grupo, Selecao } from "@/components/campos";
import { Formulario, type EstadoForm } from "@/components/form";
import { Campo } from "@/components/ui";
import { MODALIDADES, STATUS, TURNOS, UFS } from "@/lib/importacao/colunas";
import { inativarAluno, salvarAluno } from "./actions";

type Valores = Record<string, string>;

export function FormAluno({ novo, inicial, unidades }: { novo: boolean; inicial: Valores; unidades: string[] }) {
  return (
    <Formulario
      acao={salvarAluno.bind(null, novo)}
      textoBotao={novo ? "Cadastrar aluno" : "Salvar alterações"}
      textoPendente="Salvando…"
    >
      {(estado: EstadoForm) => {
        const v = { ...inicial, ...estado.valores };
        const e = estado.erros ?? {};
        const campo = (nome: string, rotulo: string, extra: Record<string, unknown> = {}) => (
          <Campo id={nome} name={nome} rotulo={rotulo} defaultValue={v[nome] ?? ""} erro={e[nome]} {...extra} />
        );
        return (
          <>
            <Grupo titulo="Identificação">
              <div className="grid gap-4 sm:grid-cols-2">
                {campo("id_aluno", "Matrícula (id_aluno) *", {
                  readOnly: !novo,
                  ajuda: novo ? undefined : "A matrícula não pode ser alterada.",
                })}
                {campo("nome", "Nome completo *")}
                {campo("email", "E-mail *", { type: "email" })}
                {campo("data_nascimento", "Data de nascimento", { type: "date" })}
                {campo("idade", "Idade", { inputMode: "numeric" })}
                {campo("genero", "Gênero")}
              </div>
            </Grupo>
            <Grupo titulo="Unidade e localização">
              <div className="grid gap-4 sm:grid-cols-3">
                <Selecao id="unidade" name="unidade" rotulo="Unidade *" opcoes={unidades} vazio="Selecione…" defaultValue={v.unidade ?? ""} erro={e.unidade} />
                {campo("cidade", "Cidade")}
                <Selecao id="estado" name="estado" rotulo="UF" opcoes={UFS} vazio="—" defaultValue={v.estado ?? ""} erro={e.estado} />
              </div>
            </Grupo>
            <Grupo titulo="Curso e matrícula">
              <div className="grid gap-4 sm:grid-cols-3">
                {campo("nivel_curso", "Nível do curso")}
                <Selecao id="modalidade" name="modalidade" rotulo="Modalidade" opcoes={[...MODALIDADES]} vazio="—" defaultValue={v.modalidade ?? ""} erro={e.modalidade} />
                <Selecao id="turno" name="turno" rotulo="Turno" opcoes={[...TURNOS]} vazio="—" defaultValue={v.turno ?? ""} erro={e.turno} />
                {campo("canal_aquisicao", "Canal de aquisição")}
                {campo("plano", "Plano")}
                {campo("data_matricula", "Data da matrícula", { type: "date" })}
                <Selecao
                  id="status_matricula"
                  name="status_matricula"
                  rotulo="Situação da matrícula *"
                  opcoes={[...STATUS]}
                  vazio="Selecione…"
                  defaultValue={v.status_matricula ?? ""}
                  erro={e.status_matricula}
                />
                {campo("data_cancelamento", "Data de cancelamento", { type: "date" })}
              </div>
            </Grupo>
            <Grupo titulo="Financeiro">
              <div className="grid gap-4 sm:grid-cols-2">
                {campo("desconto_percentual", "Desconto (%)", { inputMode: "decimal", ajuda: "De 0 a 100." })}
                {campo("Valor Mensalidade", "Valor da mensalidade (R$)", { inputMode: "decimal" })}
              </div>
            </Grupo>
          </>
        );
      }}
    </Formulario>
  );
}

export function FormInativar({ idAluno }: { idAluno: string }) {
  return (
    <Formulario acao={inativarAluno.bind(null, idAluno)} textoBotao="Confirmar inativação" textoPendente="Inativando…">
      <div className="grid gap-4 sm:grid-cols-2">
        <Selecao id="inativar-status" name="status" rotulo="Nova situação" opcoes={["Trancada", "Cancelada"]} defaultValue="Trancada" />
        <Campo id="inativar-data" name="data_cancelamento" type="date" rotulo="Data de cancelamento" ajuda="Só para Cancelada. Em branco = hoje." />
      </div>
    </Formulario>
  );
}
