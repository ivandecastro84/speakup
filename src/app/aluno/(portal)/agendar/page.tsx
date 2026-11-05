import type { Metadata } from "next";
import Link from "next/link";
import { Alerta, EstadoVazio } from "@/components/ui";
import { chamarAluno } from "../dados";
import { Catalogo, type DiaCatalogo } from "./catalogo";

export const metadata: Metadata = { title: "Agendar reposição" };

interface RespostaCatalogo {
  saldo: number;
  bloqueio: "SALDO_ZERO" | "SEM_TURMA" | "MATRICULA_INATIVA" | null;
  limite_mes: number;
  usadas_mes: number;
  dias: DiaCatalogo[];
}

const BLOQUEIOS: Record<NonNullable<RespostaCatalogo["bloqueio"]>, { titulo: string; descricao: string }> = {
  SALDO_ZERO: {
    titulo: "Você não tem reposições disponíveis",
    descricao: "Cada falta registrada em aula gera uma reposição, válida até o fim do mês seguinte.",
  },
  SEM_TURMA: { titulo: "Você ainda não está em uma turma", descricao: "Procure a secretaria da sua unidade." },
  MATRICULA_INATIVA: { titulo: "Matrícula inativa", descricao: "Só alunos com matrícula ativa podem agendar reposições." },
};

export default async function Agendar() {
  const c = await chamarAluno<RespostaCatalogo>("aluno_catalogo_reposicao");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Agendar reposição</h1>
        <p className="text-suave">
          Saldo: <strong className="text-texto">{c.saldo}</strong> · usadas este mês: {c.usadas_mes}/{c.limite_mes}
        </p>
      </div>
      {c.bloqueio ? (
        <EstadoVazio titulo={BLOQUEIOS[c.bloqueio].titulo} descricao={BLOQUEIOS[c.bloqueio].descricao} />
      ) : c.dias.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum horário disponível nos próximos dias"
          descricao="Não há vaga em turmas do seu nível nem professor livre. Tente novamente mais tarde."
        />
      ) : (
        <>
          <Alerta tipo="info">
            Escolha um horário. Você pode cancelar sem custo até 4 h antes; depois disso o crédito é consumido.
          </Alerta>
          <Catalogo dias={c.dias} />
        </>
      )}
      <Link href="/aluno" className="text-sm text-suave underline">
        Voltar ao início
      </Link>
    </div>
  );
}
