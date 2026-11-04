import type { Metadata } from "next";
import Link from "next/link";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { chamarAdm, exigirPermissaoPagina } from "../dados";

export const metadata: Metadata = { title: "Auditoria" };

interface Registro {
  id: number;
  ocorrido_em: string;
  ator_tipo: string;
  ator_id: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  ip: string | null;
  detalhes: Record<string, unknown>;
}

const POR_PAGINA = 50;
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ antes?: string }> }) {
  await exigirPermissaoPagina("AUDITORIA_LER");
  const { antes } = await searchParams;
  const antesDe = antes && /^\d+$/.test(antes) ? Number(antes) : null;
  const registros = await chamarAdm<Registro[]>("adm_listar_auditoria", {
    p_limite: POR_PAGINA,
    p_antes_de: antesDe,
  });
  const ultimo = registros.at(-1);

  return (
    <>
      <Cabecalho
        titulo="Auditoria"
        descricao="Registro somente leitura de acessos e alterações. Não pode ser editado."
      />
      {registros.length === 0 ? (
        <EstadoVazio titulo="Nenhum registro encontrado" />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registros de auditoria, do mais recente para o mais antigo</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Data/hora</th>
                <th scope="col" className="px-4 py-3 font-medium">Ação</th>
                <th scope="col" className="px-4 py-3 font-medium">Autor</th>
                <th scope="col" className="px-4 py-3 font-medium">Alvo</th>
                <th scope="col" className="px-4 py-3 font-medium">IP</th>
                <th scope="col" className="px-4 py-3 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {registros.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dataHora.format(new Date(r.ocorrido_em))}</td>
                  <td className="px-4 py-3 font-medium">{r.acao}</td>
                  <td className="px-4 py-3">
                    {r.ator_tipo}
                    {r.ator_id ? <span className="block text-suave">{r.ator_id}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.entidade ?? "—"}
                    {r.entidade_id ? <span className="block text-suave">{r.entidade_id}</span> : null}
                  </td>
                  <td className="px-4 py-3">{r.ip ?? "—"}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs">
                      {Object.keys(r.detalhes ?? {}).length ? JSON.stringify(r.detalhes) : "—"}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
      <div className="mt-4 flex gap-4 text-sm">
        {antesDe && (
          <Link href="/adm/auditoria" className="min-h-11 content-center underline">
            Mais recentes
          </Link>
        )}
        {registros.length === POR_PAGINA && ultimo && (
          <Link href={`/adm/auditoria?antes=${ultimo.id}`} className="min-h-11 content-center underline">
            Registros anteriores
          </Link>
        )}
      </div>
    </>
  );
}
