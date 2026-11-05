import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta } from "@/components/campos";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { FormEmpresa } from "./forms";
import { formatarCnpj } from "./formatar";

export const metadata: Metadata = { title: "Empresas" };

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  freq_minima: number;
  media_minima: number;
  ativa: boolean;
  alunos: number;
  ultimo_envio: string | null;
}

export default async function Empresas() {
  await exigirPermissaoPagina("EMPRESAS_GERENCIAR");
  const empresas = await chamarAdm<Empresa[]>("adm_listar_empresas");
  return (
    <>
      <Cabecalho titulo="Empresas" descricao="Clientes corporativos: alunos vinculados e regra de elegibilidade a benefício." />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {empresas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma empresa cadastrada" descricao="Cadastre a primeira empresa ao lado." />
        ) : (
          <Cartao className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Empresas</caption>
              <thead className="border-b border-borda text-suave">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Empresa</th>
                  <th scope="col" className="px-4 py-3 font-medium">RH</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Alunos</th>
                  <th scope="col" className="px-4 py-3 font-medium">Regra</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {empresas.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">
                      <Link href={`/adm/empresas/${e.id}`} className="font-medium underline">
                        {e.nome}
                      </Link>
                      <span className="block text-suave">{formatarCnpj(e.cnpj)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {e.contato_nome ?? "—"}
                      {e.contato_email && <span className="block text-suave">{e.contato_email}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.alunos}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      freq. ≥ {Number(e.freq_minima)}% · média ≥ {Number(e.media_minima)}
                    </td>
                    <td className="px-4 py-3">
                      <Etiqueta tom={e.ativa ? "sucesso" : "neutro"}>{e.ativa ? "Ativo" : "Inativo"}</Etiqueta>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        )}
        <Cartao>
          <h2 className="mb-4 text-lg">Nova empresa</h2>
          <FormEmpresa
            id={null}
            inicial={{ nome: "", cnpj: "", contato_nome: "", contato_email: "", freq_minima: "75", media_minima: "7", ativa: true }}
          />
        </Cartao>
      </div>
    </>
  );
}
