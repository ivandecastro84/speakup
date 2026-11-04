import type { Metadata } from "next";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { FormCriarUnidade } from "../../forms";
import { chamarAdm, exigirPermissaoPagina } from "../dados";

export const metadata: Metadata = { title: "Unidades" };

export default async function Unidades() {
  await exigirPermissaoPagina("UNIDADES_GERENCIAR");
  const unidades = await chamarAdm<{ id: string; nome: string }[]>("adm_listar_unidades");

  return (
    <>
      <Cabecalho titulo="Unidades" descricao="Unidades da rede usadas no vínculo de alunos e usuários." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Cartao>
          <h2 className="mb-3 text-lg font-semibold">Cadastradas</h2>
          {unidades.length === 0 ? (
            <EstadoVazio titulo="Nenhuma unidade cadastrada" descricao="Cadastre a primeira unidade ao lado." />
          ) : (
            <ul className="divide-y divide-borda">
              {unidades.map((u) => (
                <li key={u.id} className="py-3 font-medium">
                  {u.nome}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
        <Cartao>
          <h2 className="mb-4 text-lg font-semibold">Nova unidade</h2>
          <FormCriarUnidade />
        </Cartao>
      </div>
    </>
  );
}
