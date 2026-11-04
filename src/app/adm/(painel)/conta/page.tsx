import type { Metadata } from "next";
import { Cabecalho, Cartao } from "@/components/ui";
import { FormTrocarSenhaAdm } from "../../forms";
import { ROTULO_PAPEL, admAtual } from "../dados";

export const metadata: Metadata = { title: "Minha conta" };

export default async function Conta() {
  const u = await admAtual();
  return (
    <>
      <Cabecalho titulo="Minha conta" />
      <div className="grid max-w-3xl gap-6">
        <Cartao>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-suave">Nome</dt>
              <dd className="font-medium">{u.nome}</dd>
            </div>
            <div>
              <dt className="text-suave">E-mail</dt>
              <dd className="font-medium">{u.email}</dd>
            </div>
            <div>
              <dt className="text-suave">Papel</dt>
              <dd className="font-medium">{ROTULO_PAPEL[u.papel]}</dd>
            </div>
            <div>
              <dt className="text-suave">Unidades</dt>
              <dd className="font-medium">
                {u.permissoes.includes("TODAS_UNIDADES") ? "Todas" : u.unidades.join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </Cartao>
        <Cartao className="max-w-md">
          <h2 className="mb-4 text-lg font-semibold">Alterar senha</h2>
          <FormTrocarSenhaAdm />
        </Cartao>
      </div>
    </>
  );
}
