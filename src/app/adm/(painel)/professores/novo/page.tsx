import type { Metadata } from "next";
import Link from "next/link";
import { Cabecalho, Cartao } from "@/components/ui";
import { admAtual, exigirPermissaoPagina } from "../../dados";
import { FormProfessor } from "../forms";

export const metadata: Metadata = { title: "Novo professor" };

export default async function NovoProfessor() {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const u = await admAtual();
  return (
    <>
      <Link href="/adm/professores" className="text-sm text-suave underline">
        ← Professores
      </Link>
      <Cabecalho titulo="Novo professor" descricao="Depois de salvar, marque a grade de disponibilidade." />
      <Cartao className="max-w-3xl">
        <FormProfessor
          id={null}
          unidades={u.unidades}
          inicial={{ nome: "", email: "", telefone: "", idiomas: "", niveis: "", unidades: u.unidades.length === 1 ? u.unidades : [], ativo: true }}
        />
      </Cartao>
    </>
  );
}
