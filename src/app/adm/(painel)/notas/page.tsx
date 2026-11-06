import type { Metadata } from "next";
import { Cabecalho, Cartao } from "@/components/ui";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { type AlunoNotas, type Avaliacao, PainelNotas } from "./painel";

export const metadata: Metadata = { title: "Notas" };

export default async function Notas({ searchParams }: { searchParams: Promise<{ aluno?: string }> }) {
  await exigirPermissaoPagina("NOTAS_LANCAR");
  const { aluno } = await searchParams;
  const alunos = await chamarAdm<AlunoNotas[]>("adm_notas_alunos");
  const sel = aluno && alunos.some((a) => a.id_aluno === aluno) ? aluno : null;
  const historico = sel ? await chamarAdm<Avaliacao[]>("adm_notas_do_aluno", { p_id_aluno: sel }) : [];
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <Cabecalho
        titulo="Notas"
        descricao="Lançamento individual: escolha o aluno, a turma e a data e preencha Speaking, Listening, Reading, Writing e o nível CEFR."
      />
      <Cartao>
        <PainelNotas key={sel ?? "nenhum"} alunos={alunos} selecionado={sel} historico={historico} hoje={hoje} />
      </Cartao>
    </>
  );
}
