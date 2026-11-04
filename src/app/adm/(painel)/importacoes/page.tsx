import type { Metadata } from "next";
import { Cabecalho, Cartao, EstadoVazio, cx } from "@/components/ui";
import { COLUNAS, LIMITES } from "@/lib/importacao/colunas";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { ImportarAlunos } from "./modal";

export const metadata: Metadata = { title: "Importações" };

interface LinhaLote {
  id: string;
  status: "PROCESSANDO" | "CONCLUIDA" | "REJEITADA" | "FALHOU";
  arquivo_nome: string;
  usuario_nome: string;
  atomica: boolean;
  total_linhas: number;
  inseridos: number;
  atualizados: number;
  rejeitados: number;
  avisos: number;
  iniciado_em: string;
}

const ROTULO_STATUS: Record<LinhaLote["status"], { texto: string; cor: string }> = {
  PROCESSANDO: { texto: "Processando", cor: "bg-info-suave text-info" },
  CONCLUIDA: { texto: "Concluída", cor: "bg-sucesso-suave text-sucesso" },
  REJEITADA: { texto: "Rejeitada", cor: "bg-erro-suave text-erro" },
  FALHOU: { texto: "Falhou", cor: "bg-erro-suave text-erro" },
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function Importacoes() {
  await exigirPermissaoPagina("ALUNOS_IMPORTAR");
  const lotes = await chamarAdm<LinhaLote[]>("adm_listar_importacoes", { p_limite: 50 });

  return (
    <>
      <Cabecalho
        titulo="Importações de alunos"
        descricao="Carga e atualização da base de alunos por planilha (.xlsx ou .csv)."
        acao={<ImportarAlunos limiteMb={LIMITES.arquivoMb} colunas={COLUNAS} />}
      />
      {lotes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma importação ainda"
          descricao='Use "Importar alunos" para enviar a primeira planilha com as 19 colunas oficiais.'
        />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Histórico de importações, da mais recente para a mais antiga</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Data</th>
                <th scope="col" className="px-4 py-3 font-medium">Arquivo</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Linhas</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Inseridos</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Atualizados</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Rejeitados</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Avisos</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Log</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lotes.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dataHora.format(new Date(l.iniciado_em))}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{l.arquivo_nome}</span>
                    <span className="block text-suave">{l.usuario_nome}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", ROTULO_STATUS[l.status].cor)}>
                      {ROTULO_STATUS[l.status].texto}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.total_linhas}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.inseridos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.atualizados}</td>
                  <td className={cx("px-4 py-3 text-right tabular-nums", l.rejeitados > 0 && "font-semibold text-erro")}>
                    {l.rejeitados}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.avisos}</td>
                  <td className="px-4 py-3">
                    {(l.rejeitados > 0 || l.avisos > 0 || l.status === "REJEITADA") && (
                      <a href={`/api/adm/importacoes/${l.id}/log`} className="inline-flex min-h-11 items-center underline">
                        Baixar log
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
