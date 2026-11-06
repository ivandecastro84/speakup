import type { Metadata } from "next";
import { headers } from "next/headers";
import { Selecao } from "@/components/campos";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { AcoesChave } from "./chaves";
import { TesteApi } from "./teste";

export const metadata: Metadata = { title: "API de notas" };

interface Chaves {
  pode_gerenciar: boolean;
  empresas: {
    id: string; nome: string; ativa: boolean; media_minima: number; alunos: number;
    chave: { prefixo: string; criada_em: string; ultimo_uso_em: string | null; criada_por: string } | null;
  }[];
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ApiNotas() {
  await exigirPermissaoPagina("EMPRESAS_GERENCIAR");
  const d = await chamarAdm<Chaves>("adm_chaves_api");
  const h = await headers();
  const base = process.env.API_BASE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <Cabecalho
        titulo="API de notas"
        descricao="Integração para as empresas clientes consultarem as notas dos alunos vinculados a elas, com chave de API própria."
      />
      <div className="flex flex-col gap-6">
        <Cartao aria-labelledby="titulo-endpoint">
          <h2 id="titulo-endpoint" className="text-lg">Endereço</h2>
          <p className="mt-2 text-sm">
            <code className="rounded bg-fundo px-2 py-1 font-mono">POST {base}/api/v1/notas</code>
          </p>
          <p className="mt-2 text-sm text-suave">
            Cabeçalho <code className="font-mono">Authorization: Bearer &lt;chave&gt;</code> e corpo JSON{" "}
            <code className="font-mono">{'{"id_aluno": "...", "nome": "..."}'}</code>. Cada empresa só enxerga os próprios alunos; toda
            consulta fica na auditoria.
          </p>
        </Cartao>

        <Cartao className="overflow-x-auto p-0" aria-labelledby="titulo-chaves">
          <div className="p-5 pb-3">
            <h2 id="titulo-chaves" className="text-lg">Chaves de acesso por empresa</h2>
            <p className="mt-1 text-sm text-suave">
              {d.pode_gerenciar
                ? "A chave completa aparece só no momento em que é gerada. Gerar uma nova invalida a anterior."
                : "Somente o superadministrador gera ou revoga chaves, porque a chave dá acesso aos alunos da empresa em todas as unidades."}
            </p>
          </div>
          {d.empresas.length === 0 ? (
            <div className="p-5 pt-0">
              <EstadoVazio titulo="Nenhuma empresa cadastrada" descricao="Cadastre a empresa e vincule os alunos no menu Empresas." />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Chaves de API por empresa</caption>
              <thead className="border-y border-borda text-suave">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Empresa</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Alunos vinculados</th>
                  <th scope="col" className="px-5 py-3 font-medium">Chave</th>
                  {d.pode_gerenciar && <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {d.empresas.map((e) => (
                  <tr key={e.id} className="align-top">
                    <th scope="row" className="px-5 py-3 font-medium">
                      {e.nome}
                      {!e.ativa && <span className="block text-xs font-normal text-erro">Contrato inativo</span>}
                    </th>
                    <td className="px-5 py-3 text-right tabular-nums">{e.alunos}</td>
                    <td className="px-5 py-3">
                      {e.chave ? (
                        <>
                          <code className="font-mono">{e.chave.prefixo}…</code>
                          <span className="block text-xs text-suave">
                            criada {dataHora.format(new Date(e.chave.criada_em))} por {e.chave.criada_por} · último uso{" "}
                            {e.chave.ultimo_uso_em ? dataHora.format(new Date(e.chave.ultimo_uso_em)) : "nunca"}
                          </span>
                        </>
                      ) : (
                        <span className="text-suave">Sem chave</span>
                      )}
                    </td>
                    {d.pode_gerenciar && (
                      <td className="px-5 py-3">
                        {e.ativa && <AcoesChave empresaId={e.id} empresaNome={e.nome} temChave={Boolean(e.chave)} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>

        <Cartao id="teste-api" aria-labelledby="titulo-teste">
          <h2 id="titulo-teste" className="text-lg">Ambiente de testes</h2>
          <p className="mb-4 mt-1 text-sm text-suave">
            Faz uma chamada real à API, exatamente como a empresa fará, e mostra a resposta recebida. A consulta fica registrada na
            auditoria.
          </p>
          <TesteApi />
        </Cartao>

        <Cartao aria-labelledby="titulo-doc">
          <h2 id="titulo-doc" className="text-lg">Documentação para a empresa parceira</h2>
          <p className="mb-4 mt-1 text-sm text-suave">
            PDF com endereço, autenticação, formato do envio, exemplo completo, interpretação da resposta e erros. Escolha uma empresa
            para personalizar com o nome dela e a média mínima combinada (a chave nunca vai no documento).
          </p>
          <form method="get" action="/api/adm/api-notas/documentacao" className="flex flex-wrap items-end gap-4">
            <div className="min-w-64">
              <Selecao id="empresa" name="empresa" rotulo="Empresa (opcional)" vazio="Documento genérico"
                opcoes={d.empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))} defaultValue="" />
            </div>
            <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-5 text-sm font-semibold text-destaque-texto">
              Baixar Documentação
            </button>
          </form>
        </Cartao>
      </div>
    </>
  );
}
