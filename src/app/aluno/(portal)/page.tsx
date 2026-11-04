import type { Metadata } from "next";
import Link from "next/link";
import { Alerta, Cartao } from "@/components/ui";
import { alunoAtual } from "./dados";

export const metadata: Metadata = { title: "Início" };

export default async function InicioAluno() {
  const aluno = await alunoAtual();
  const primeiroNome = aluno.nome.split(" ")[0];
  const encerrada = aluno.status_matricula === "Cancelada";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Olá, {primeiroNome}</h1>
        <p className="text-suave">Matrícula {aluno.id_aluno}</p>
      </div>

      {encerrada ? (
        <Alerta tipo="aviso">
          Sua matrícula está encerrada
          {aluno.data_cancelamento ? ` desde ${formatarData(aluno.data_cancelamento)}` : ""}. Para voltar a
          estudar, procure a secretaria da sua unidade.
        </Alerta>
      ) : (
        aluno.status_matricula !== "Ativa" && (
          <Alerta tipo="info">Situação da matrícula: {aluno.status_matricula}.</Alerta>
        )
      )}

      <Cartao aria-labelledby="titulo-matricula">
        <h2 id="titulo-matricula" className="text-lg font-semibold">
          Minha matrícula
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Item rotulo="Situação" valor={aluno.status_matricula} />
          <Item rotulo="Unidade" valor={aluno.unidade} />
          <Item rotulo="Curso" valor={aluno.nivel_curso} />
          <Item rotulo="Modalidade" valor={aluno.modalidade} />
          <Item rotulo="Turno" valor={aluno.turno} />
          <Item rotulo="Plano" valor={aluno.plano} />
        </dl>
      </Cartao>

      <Link
        href="/aluno/perfil"
        className="flex min-h-14 items-center justify-between rounded-padrao border border-borda bg-superficie px-5 font-semibold hover:border-destaque"
      >
        Perfil
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-suave">{rotulo}</dt>
      <dd className="font-medium">{valor || "—"}</dd>
    </div>
  );
}

function formatarData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
