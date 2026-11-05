import type { Metadata } from "next";
import Link from "next/link";
import { Cabecalho, Cartao } from "@/components/ui";
import { admAtual, exigirPermissaoPagina } from "../../dados";
import { FormAluno } from "../forms";

export const metadata: Metadata = { title: "Novo aluno" };

export default async function NovoAluno() {
  await exigirPermissaoPagina("ALUNOS_EDITAR");
  const u = await admAtual();
  return (
    <>
      <Link href="/adm/alunos" className="text-sm text-suave underline">
        ← Alunos
      </Link>
      <Cabecalho titulo="Novo aluno" descricao="O aluno entra no portal com a matrícula e a senha inicial padrão." />
      <Cartao className="max-w-4xl">
        <FormAluno novo inicial={{ status_matricula: "Ativa", unidade: u.unidades.length === 1 ? u.unidades[0] : "" }} unidades={u.unidades} />
      </Cartao>
    </>
  );
}
