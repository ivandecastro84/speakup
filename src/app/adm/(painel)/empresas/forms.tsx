"use client";

import { Selecao } from "@/components/campos";
import { Formulario, type EstadoForm } from "@/components/form";
import { Campo } from "@/components/ui";
import { definirEmpresaAluno, salvarEmpresa, vincularAlunos } from "./actions";

export interface DadosEmpresa {
  nome: string;
  cnpj: string;
  contato_nome: string;
  contato_email: string;
  freq_minima: string;
  media_minima: string;
  ativa: boolean;
}

export function FormEmpresa({ id, inicial }: { id: string | null; inicial: DadosEmpresa }) {
  return (
    <Formulario acao={salvarEmpresa.bind(null, id)} textoBotao={id ? "Salvar empresa" : "Cadastrar empresa"} textoPendente="Salvando…">
      {(estado: EstadoForm) => {
        const v = { ...inicial, ...estado.valores };
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="nome" name="nome" rotulo="Nome *" defaultValue={v.nome} />
              <Campo id="cnpj" name="cnpj" rotulo="CNPJ" defaultValue={v.cnpj} inputMode="numeric" ajuda="14 dígitos, com ou sem pontuação." />
              <Campo id="contato_nome" name="contato_nome" rotulo="Contato no RH" defaultValue={v.contato_nome} />
              <Campo id="contato_email" name="contato_email" type="email" rotulo="E-mail do RH" defaultValue={v.contato_email} />
            </div>
            <fieldset className="grid gap-4 rounded-padrao border border-borda p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-suave">Elegibilidade a benefício</legend>
              <Campo id="freq_minima" name="freq_minima" rotulo="Frequência mínima (%)" inputMode="decimal" defaultValue={v.freq_minima} />
              <Campo id="media_minima" name="media_minima" rotulo="Média mínima (0–10)" inputMode="decimal" defaultValue={v.media_minima} />
            </fieldset>
            {id && (
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="ativa" defaultChecked={inicial.ativa} className="size-5" />
                Contrato ativo
              </label>
            )}
          </>
        );
      }}
    </Formulario>
  );
}

export function FormVincular({ empresaId }: { empresaId: string }) {
  return (
    <Formulario acao={vincularAlunos.bind(null, empresaId)} textoBotao="Vincular alunos" textoPendente="Vinculando…">
      {(estado: EstadoForm) => (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="matriculas" className="text-sm font-medium">
            Matrículas (id_aluno)
          </label>
          <textarea
            id="matriculas"
            name="matriculas"
            rows={6}
            defaultValue={estado.valores?.matriculas ?? ""}
            placeholder={"2026001\n2026002\n…"}
            className="rounded-padrao border border-borda-campo bg-superficie px-3 py-2 font-mono text-sm text-texto"
            aria-describedby="matriculas-ajuda"
          />
          <p id="matriculas-ajuda" className="text-sm text-suave">
            Cole a coluna id_aluno da planilha (uma por linha, ou separadas por vírgula). Alunos de outra empresa são transferidos.
          </p>
        </div>
      )}
    </Formulario>
  );
}

export function FormEmpresaAluno({
  idAluno,
  atual,
  empresas,
}: {
  idAluno: string;
  atual: string | null;
  empresas: { id: string; nome: string }[];
}) {
  return (
    <Formulario acao={definirEmpresaAluno.bind(null, idAluno)} textoBotao="Salvar vínculo" textoPendente="Salvando…">
      <Selecao
        id="empresa"
        name="empresa"
        rotulo="Empresa (contrato corporativo)"
        vazio="Nenhuma (aluno particular)"
        opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
        defaultValue={atual ?? ""}
      />
    </Formulario>
  );
}
