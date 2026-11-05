import type { Metadata } from "next";
import Link from "next/link";
import { Alerta, Cabecalho, Cartao } from "@/components/ui";
import { exigirPermissaoPagina } from "../../dados";
import { FormTurma } from "../forms";
import { opcoesTurma } from "../opcoes";

export const metadata: Metadata = { title: "Nova turma" };

export default async function NovaTurma() {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const opcoes = await opcoesTurma();
  return (
    <>
      <Link href="/adm/turmas" className="text-sm text-suave underline">
        ← Turmas
      </Link>
      <Cabecalho titulo="Nova turma" />
      {opcoes.professores.length === 0 && (
        <div className="mb-6">
          <Alerta tipo="aviso">
            Nenhum professor ativo no seu escopo. <Link href="/adm/professores/novo" className="underline">Cadastre um professor</Link> antes.
          </Alerta>
        </div>
      )}
      <Cartao className="max-w-4xl">
        <FormTurma
          id={null}
          opcoes={opcoes}
          inicial={{
            codigo: "", nome: "", unidade: opcoes.unidades.length === 1 ? opcoes.unidades[0] : "", idioma: "", nivel_curso: "",
            modalidade: "Presencial", professor_id: "", sala_id: "", capacidade: "", data_inicio: "", data_fim: "",
            situacao: "Ativa", horarios: [],
          }}
        />
      </Cartao>
    </>
  );
}
