import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta, Selecao, rotuloHorario } from "@/components/campos";
import { BotaoLink, Cabecalho, Campo, Cartao, EstadoVazio } from "@/components/ui";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../dados";

export const metadata: Metadata = { title: "Turmas" };

export interface LinhaTurma {
  id: string;
  codigo: string;
  nome: string;
  unidade: string;
  idioma: string;
  nivel_curso: string;
  modalidade: string;
  professor: string;
  sala: string | null;
  capacidade: number;
  inscritos: number;
  situacao: string;
  data_inicio: string;
  data_fim: string;
  horarios: { dia: number; hora: number }[];
}

const data = (iso: string) => iso.split("-").reverse().join("/");

export default async function Turmas({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string; situacao?: string; busca?: string }>;
}) {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const u = await admAtual();
  const f = await searchParams;
  const situacao = f.situacao ?? "Ativa";
  const turmas = await chamarAdm<LinhaTurma[]>("adm_listar_turmas", {
    p_unidade: f.unidade || null,
    p_situacao: situacao === "todas" ? null : situacao,
    p_busca: f.busca || null,
  });

  return (
    <>
      <Cabecalho
        titulo="Turmas"
        descricao="Turmas, professores, salas e horários — sem conflito de grade."
        acao={<BotaoLink href="/adm/turmas/nova">Nova turma</BotaoLink>}
      />
      <Cartao className="mb-6">
        <form method="get" className="grid items-end gap-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Campo id="busca" name="busca" type="search" rotulo="Buscar por código ou nome" defaultValue={f.busca ?? ""} />
          <Selecao id="f-unidade" name="unidade" rotulo="Unidade" opcoes={u.unidades} vazio="Todas" defaultValue={f.unidade ?? ""} />
          <Selecao
            id="f-situacao"
            name="situacao"
            rotulo="Situação"
            opcoes={[{ valor: "Ativa", rotulo: "Ativas" }, { valor: "Encerrada", rotulo: "Encerradas" }, { valor: "todas", rotulo: "Todas" }]}
            defaultValue={situacao}
          />
          <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
            Filtrar
          </button>
        </form>
      </Cartao>
      {turmas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma turma encontrada"
          descricao="Para criar uma turma, cadastre antes o professor (com disponibilidade) e, se for presencial, a sala."
        />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Turmas</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Turma</th>
                <th scope="col" className="px-4 py-3 font-medium">Professor</th>
                <th scope="col" className="px-4 py-3 font-medium">Horários</th>
                <th scope="col" className="px-4 py-3 font-medium">Local</th>
                <th scope="col" className="px-4 py-3 font-medium">Período</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Vagas</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {turmas.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <Link href={`/adm/turmas/${t.id}`} className="font-semibold underline">
                      {t.codigo}
                    </Link>
                    <span className="block text-suave">
                      {t.nome} · {t.idioma} {t.nivel_curso}
                    </span>
                  </td>
                  <td className="px-4 py-3">{t.professor}</td>
                  <td className="px-4 py-3">{t.horarios.map((h) => rotuloHorario(h.dia, h.hora)).join(", ")}</td>
                  <td className="px-4 py-3">
                    {t.unidade}
                    <span className="block text-suave">{t.modalidade === "Online" ? "Online" : t.sala}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {data(t.data_inicio)} – {data(t.data_fim)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.inscritos}/{t.capacidade}
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tom={t.situacao === "Ativa" ? "sucesso" : "neutro"}>{t.situacao}</Etiqueta>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
