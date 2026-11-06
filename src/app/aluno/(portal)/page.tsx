import type { Metadata } from "next";
import Link from "next/link";
import { Alerta, Cartao, EstadoVazio, cx } from "@/components/ui";
import { CancelarReposicao } from "./cancelar";
import { alunoAtual, chamarAluno, quando, type Painel } from "./dados";

export const metadata: Metadata = { title: "Início" };

export default async function InicioAluno({ searchParams }: { searchParams: Promise<{ agendado?: string; cancelada?: string }> }) {
  const [aluno, painel] = await Promise.all([alunoAtual(), chamarAluno<Painel>("aluno_painel")]);
  const { agendado, cancelada } = await searchParams;
  const primeiroNome = aluno.nome.split(" ")[0];
  const encerrada = aluno.status_matricula === "Cancelada";
  const proximas = painel.proximas.slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Olá, {primeiroNome}</h1>
        <p className="text-suave">Matrícula {aluno.id_aluno}</p>
      </div>

      {agendado && <Alerta tipo="sucesso">Reposição agendada! Ela já aparece nas suas próximas aulas.</Alerta>}
      {cancelada === "devolvido" && <Alerta tipo="sucesso">Reposição cancelada. O crédito voltou para o seu saldo.</Alerta>}
      {cancelada === "consumido" && (
        <Alerta tipo="aviso">Reposição cancelada fora do prazo: o crédito foi consumido.</Alerta>
      )}
      {encerrada ? (
        <Alerta tipo="aviso">
          Sua matrícula está encerrada
          {aluno.data_cancelamento ? ` desde ${formatarData(aluno.data_cancelamento)}` : ""}. Para voltar a
          estudar, procure a secretaria da sua unidade.
        </Alerta>
      ) : (
        aluno.status_matricula !== "Ativa" && <Alerta tipo="info">Situação da matrícula: {aluno.status_matricula}.</Alerta>
      )}

      <Cartao aria-labelledby="titulo-saldo" className="flex items-center justify-between gap-4">
        <div>
          <h2 id="titulo-saldo" className="text-sm font-medium text-suave">
            Reposições disponíveis
          </h2>
          <p className="text-4xl font-bold tabular-nums">{painel.saldo}</p>
          <p className="text-sm text-suave">
            {painel.creditos[0]
              ? `A primeira vence em ${formatarData(painel.creditos[0].valido_ate)}.`
              : "Cada falta registrada gera uma reposição."}{" "}
            Usadas este mês: {painel.usadas_mes}/{painel.limite_mes}.
          </p>
        </div>
      </Cartao>

      <nav aria-label="Acesso rápido" className="grid grid-cols-3 gap-3">
        <Atalho href="/aluno/agendar" titulo="Agendar Aula" destaque />
        <Atalho href="/aluno/presencas" titulo="Minhas Presenças" />
        <Atalho href="/aluno/perfil" titulo="Perfil" />
        <Link
          href="/aluno/memory-game"
          className="col-span-3 flex min-h-20 items-center gap-4 rounded-padrao bg-linear-to-r from-fuchsia-500 via-violet-500 to-sky-500 px-4 py-3 text-white shadow-lg transition hover:brightness-110 active:scale-[0.99]"
        >
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-2xl">
            🧠
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-bold">Memory Game</span>
            <span className="text-sm text-white/90">Encontre os pares inglês–português e some pontos</span>
          </span>
        </Link>
        <Link
          href="/aluno/dicas"
          className="col-span-3 flex min-h-20 items-center gap-4 rounded-padrao bg-linear-to-r from-amber-400 via-orange-500 to-pink-500 px-4 py-3 text-white shadow-lg transition hover:brightness-110 active:scale-[0.99]"
        >
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-2xl">
            💡
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-bold">Dicas para melhorar o inglês</span>
            <span className="text-sm text-white/90">Exemplos práticos com tradução</span>
          </span>
        </Link>
      </nav>

      <section aria-labelledby="titulo-proximas">
        <h2 id="titulo-proximas" className="mb-3 text-lg">
          Próximas aulas
        </h2>
        {proximas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma aula nos próximos dias"
            descricao={painel.tem_turma ? "Suas aulas e reposições agendadas aparecem aqui." : "Você ainda não está em nenhuma turma."}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {proximas.map((a) => (
              <li key={`${a.tipo}-${a.data}-${a.hora}-${a.reposicao_id ?? a.turma}`}>
                <Cartao className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-suave">{quando(a.data, a.hora, true)}</p>
                      <p className="font-semibold">
                        {a.nome}
                        {a.tipo === "Reposição" && (
                          <span className="ml-2 rounded-full bg-info-suave px-2 py-0.5 text-xs font-semibold text-info">Reposição</span>
                        )}
                      </p>
                      <p className="text-sm text-suave">
                        {a.professor} · {a.modalidade === "Online" ? "Online" : a.sala ?? "Presencial"}
                      </p>
                      {a.tipo === "Reposição" && a.reposicao_id && (
                        <a
                          href={`/api/aluno/reposicoes/${a.reposicao_id}/convite`}
                          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline"
                        >
                          Adicionar à agenda (.ics)
                        </a>
                      )}
                    </div>
                    {a.tipo === "Reposição" && a.reposicao_id && (
                      <CancelarReposicao id={a.reposicao_id} gratuito={Boolean(a.cancelamento_gratuito)} antecedencia={painel.antecedencia_horas} />
                    )}
                  </div>
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Atalho({ href, titulo, destaque }: { href: string; titulo: string; destaque?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "flex min-h-20 items-center justify-center rounded-padrao border p-3 text-center text-sm font-semibold",
        destaque ? "border-transparent bg-destaque text-destaque-texto" : "border-borda bg-superficie hover:border-borda-campo",
      )}
    >
      {titulo}
    </Link>
  );
}

function formatarData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
