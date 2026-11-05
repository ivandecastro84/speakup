import Link from "next/link";
import type { Metadata } from "next";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { admAtual, chamarAdm } from "./dados";

export const metadata: Metadata = { title: "Visão geral" };

interface LinhaResumo {
  unidade: string;
  total: number;
  ativa: number;
  trancada: number;
  cancelada: number;
  concluida: number;
}

export default async function VisaoGeral() {
  const u = await admAtual();

  if (!u.permissoes.includes("ALUNOS_LER")) {
    return (
      <>
        <Cabecalho titulo={`Olá, ${u.nome.split(" ")[0]}`} />
        {u.permissoes.includes("RELATORIOS_LER") ? (
          <Cartao className="max-w-xl">
            <h2 className="text-lg">Relatórios de RH</h2>
            <p className="mt-1 text-sm text-suave">
              Frequência, notas, evolução CEFR e elegibilidade a benefício dos colaboradores das empresas que você acompanha.
            </p>
            <Link
              href="/adm/relatorios"
              className="mt-4 inline-flex min-h-11 items-center rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto"
            >
              Abrir relatórios
            </Link>
          </Cartao>
        ) : (
          <EstadoVazio titulo="Nenhuma área disponível no momento" />
        )}
      </>
    );
  }

  const resumo = await chamarAdm<LinhaResumo[]>("adm_resumo");
  const total = resumo.reduce((s, l) => s + Number(l.total), 0);
  const ativos = resumo.reduce((s, l) => s + Number(l.ativa), 0);

  return (
    <>
      <Cabecalho
        titulo="Visão geral"
        descricao={
          u.permissoes.includes("TODAS_UNIDADES")
            ? "Todas as unidades."
            : `Unidades: ${u.unidades.join(", ") || "nenhuma"}.`
        }
      />

      {resumo.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma unidade vinculada ao seu usuário"
          descricao="Peça ao superadministrador para vincular você às unidades em que atua."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Indicador rotulo="Alunos" valor={total} />
            <Indicador rotulo="Matrículas ativas" valor={ativos} />
            <Indicador rotulo="Unidades" valor={resumo.length} />
          </div>
          <Cartao className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Alunos por unidade e situação da matrícula</caption>
              <thead className="border-b border-borda text-suave">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Unidade</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Ativa</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Trancada</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Cancelada</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Concluída</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {resumo.map((l) => (
                  <tr key={l.unidade}>
                    <th scope="row" className="px-5 py-3 font-medium">{l.unidade}</th>
                    <td className="px-5 py-3 text-right tabular-nums">{l.ativa}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{l.trancada}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{l.cancelada}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{l.concluida}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{l.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
          {total === 0 && (
            <EstadoVazio
              titulo="Ainda não há alunos cadastrados"
              descricao={
                u.permissoes.includes("ALUNOS_IMPORTAR")
                  ? "Use o menu Importações para carregar a base de alunos a partir de uma planilha."
                  : "Os alunos aparecerão aqui depois da primeira importação."
              }
            />
          )}
        </div>
      )}
    </>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Cartao>
      <p className="text-sm text-suave">{rotulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{valor.toLocaleString("pt-BR")}</p>
    </Cartao>
  );
}
