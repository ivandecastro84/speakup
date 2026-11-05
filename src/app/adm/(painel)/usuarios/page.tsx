import type { Metadata } from "next";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { FormCriarUsuario, FormEmpresasRh } from "../../forms";
import { ROTULO_PAPEL, chamarAdm, exigirPermissaoPagina, type UsuarioAdm } from "../dados";

export const metadata: Metadata = { title: "Usuários" };

interface LinhaUsuario {
  id: string;
  nome: string;
  email: string;
  papel: UsuarioAdm["papel"];
  ativo: boolean;
  unidades: string[];
}

export default async function Usuarios() {
  await exigirPermissaoPagina("USUARIOS_GERENCIAR");
  const [usuarios, unidades, empresas, empresasRh] = await Promise.all([
    chamarAdm<LinhaUsuario[]>("adm_listar_usuarios"),
    chamarAdm<{ nome: string }[]>("adm_listar_unidades"),
    chamarAdm<{ id: string; nome: string }[]>("adm_listar_empresas"),
    chamarAdm<Record<string, string[]>>("adm_empresas_usuarios_rh"),
  ]);
  const rh = usuarios.filter((x) => x.papel === "ADM_RH");

  return (
    <>
      <Cabecalho titulo="Usuários administrativos" descricao="Coordenação, RH e superadministradores." />
      <div className="flex flex-col gap-6">
        <Cartao className="overflow-x-auto p-0">
          {usuarios.length === 0 ? (
            <div className="p-5">
              <EstadoVazio titulo="Nenhum usuário cadastrado" />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Usuários administrativos</caption>
              <thead className="border-b border-borda text-suave">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Nome</th>
                  <th scope="col" className="px-5 py-3 font-medium">E-mail</th>
                  <th scope="col" className="px-5 py-3 font-medium">Papel</th>
                  <th scope="col" className="px-5 py-3 font-medium">Unidades</th>
                  <th scope="col" className="px-5 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" className="px-5 py-3 font-medium">{u.nome}</th>
                    <td className="px-5 py-3">{u.email}</td>
                    <td className="px-5 py-3">{ROTULO_PAPEL[u.papel]}</td>
                    <td className="px-5 py-3">
                      {u.papel === "ADM_SUPERADMIN" ? "Todas" : u.papel === "ADM_RH" ? "Por empresa" : u.unidades.join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3">{u.ativo ? "Ativo" : "Inativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
        {rh.length > 0 && (
          <Cartao aria-labelledby="titulo-rh">
            <h2 id="titulo-rh" className="text-lg">
              Empresas acompanhadas pelo RH
            </h2>
            <p className="mb-4 mt-1 text-sm text-suave">
              Cada usuário de RH só vê, nos relatórios, os alunos das empresas marcadas aqui.
            </p>
            <div className="flex flex-col gap-5">
              {rh.map((x) => (
                <div key={x.id} className="rounded-padrao border border-borda p-4">
                  <p className="mb-2 font-semibold">
                    {x.nome} <span className="font-normal text-suave">· {x.email}</span>
                  </p>
                  <FormEmpresasRh usuarioId={x.id} empresas={empresas} marcadas={empresasRh[x.id] ?? []} />
                </div>
              ))}
            </div>
          </Cartao>
        )}
        <Cartao className="max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold">Novo usuário</h2>
          <FormCriarUsuario unidades={unidades.map((u) => u.nome)} />
        </Cartao>
      </div>
    </>
  );
}
