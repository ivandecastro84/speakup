"use client";

import { useState } from "react";
import { Grupo, Selecao } from "@/components/campos";
import { Formulario, type EstadoForm } from "@/components/form";
import { GradeHorarios, type Celula } from "@/components/grade";
import { Campo } from "@/components/ui";
import { incluirAluno, salvarTurma } from "./actions";

export interface OpcoesTurma {
  unidades: string[];
  professores: { id: string; nome: string; unidades: string[]; idiomas: string[]; niveis: string[] }[];
  salas: { id: string; nome: string; unidade: string; capacidade: number; ativa: boolean }[];
}

export interface DadosTurma {
  codigo: string;
  nome: string;
  unidade: string;
  idioma: string;
  nivel_curso: string;
  modalidade: string;
  professor_id: string;
  sala_id: string;
  capacidade: string;
  data_inicio: string;
  data_fim: string;
  situacao: string;
  horarios: Celula[];
}

export function FormTurma({ id, inicial, opcoes }: { id: string | null; inicial: DadosTurma; opcoes: OpcoesTurma }) {
  return (
    <Formulario acao={salvarTurma.bind(null, id)} textoBotao={id ? "Salvar turma" : "Criar turma"} textoPendente="Conferindo a grade e salvando…">
      {(estado: EstadoForm) => <CamposTurma inicial={{ ...inicial, ...estado.valores }} horarios={inicial.horarios} opcoes={opcoes} editando={Boolean(id)} />}
    </Formulario>
  );
}

function CamposTurma({
  inicial,
  horarios,
  opcoes,
  editando,
}: {
  inicial: Omit<DadosTurma, "horarios">;
  horarios: Celula[];
  opcoes: OpcoesTurma;
  editando: boolean;
}) {
  const [unidade, setUnidade] = useState(inicial.unidade);
  const [modalidade, setModalidade] = useState(inicial.modalidade || "Presencial");
  const professores = opcoes.professores.filter((p) => !unidade || p.unidades.includes(unidade));
  const salas = opcoes.salas.filter((s) => s.ativa && (!unidade || s.unidade === unidade));

  return (
    <>
      <Grupo titulo="Turma">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="codigo" name="codigo" rotulo="Código *" defaultValue={inicial.codigo} ajuda="Único. Ex.: ING-B2-NOITE" />
          <div className="sm:col-span-2">
            <Campo id="nome" name="nome" rotulo="Nome *" defaultValue={inicial.nome} />
          </div>
          <Selecao
            id="unidade"
            name="unidade"
            rotulo="Unidade *"
            opcoes={opcoes.unidades}
            vazio="Selecione…"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
          />
          <Campo id="idioma" name="idioma" rotulo="Idioma *" defaultValue={inicial.idioma} ajuda="Ex.: Inglês" />
          <Campo id="nivel_curso" name="nivel_curso" rotulo="Nível *" defaultValue={inicial.nivel_curso} ajuda="Ex.: Business" />
        </div>
      </Grupo>
      <Grupo titulo="Professor, sala e vagas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Selecao
            id="professor_id"
            name="professor_id"
            rotulo="Professor *"
            vazio={unidade ? "Selecione…" : "Escolha a unidade primeiro"}
            opcoes={professores.map((p) => ({ valor: p.id, rotulo: `${p.nome} — ${p.idiomas.join("/")} (${p.niveis.join(", ")})` }))}
            defaultValue={inicial.professor_id}
          />
          <Selecao
            id="modalidade"
            name="modalidade"
            rotulo="Modalidade *"
            opcoes={["Presencial", "Online"]}
            value={modalidade}
            onChange={(e) => setModalidade(e.target.value)}
          />
          {modalidade === "Presencial" && (
            <Selecao
              id="sala_id"
              name="sala_id"
              rotulo="Sala *"
              vazio={salas.length ? "Selecione…" : "Nenhuma sala ativa nesta unidade"}
              opcoes={salas.map((s) => ({ valor: s.id, rotulo: `${s.nome} (${s.capacidade} lugares)` }))}
              defaultValue={inicial.sala_id}
            />
          )}
          <Campo id="capacidade" name="capacidade" rotulo="Capacidade (alunos) *" inputMode="numeric" defaultValue={inicial.capacidade} />
        </div>
      </Grupo>
      <Grupo titulo="Período e horários">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="data_inicio" name="data_inicio" type="date" rotulo="Início *" defaultValue={inicial.data_inicio} />
          <Campo id="data_fim" name="data_fim" type="date" rotulo="Fim *" defaultValue={inicial.data_fim} />
          {editando ? (
            <Selecao id="situacao" name="situacao" rotulo="Situação" opcoes={["Ativa", "Encerrada"]} defaultValue={inicial.situacao || "Ativa"} />
          ) : (
            <input type="hidden" name="situacao" value="Ativa" />
          )}
        </div>
        <GradeHorarios
          nome="horarios"
          legenda="Horários semanais da turma *"
          ajuda="Ao salvar, o sistema confere disponibilidade e choque do professor, da sala e dos alunos."
          selecionados={horarios}
        />
      </Grupo>
    </>
  );
}

export function FormIncluirAluno({ turmaId }: { turmaId: string }) {
  return (
    <Formulario acao={incluirAluno.bind(null, turmaId)} textoBotao="Incluir na turma" textoPendente="Incluindo…" className="flex flex-col gap-3">
      {(estado: EstadoForm) => (
        <Campo id="id_aluno" name="id_aluno" rotulo="Matrícula do aluno" defaultValue={estado.valores?.id_aluno ?? ""} ajuda="O aluno precisa estar com matrícula Ativa e ser da mesma unidade." />
      )}
    </Formulario>
  );
}
