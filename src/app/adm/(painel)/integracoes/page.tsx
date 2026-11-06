import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta, Selecao } from "@/components/campos";
import { Paginacao } from "@/components/paginacao";
import { Cabecalho, Cartao, EstadoVazio, cx } from "@/components/ui";
import { adaptadorEmail, adaptadorPush } from "@/lib/integracoes/adaptadores";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { AcoesFila, ReprocessarItem } from "./botoes";

export const metadata: Metadata = { title: "Notificações e agenda" };

interface Item {
  fila: "notificacao" | "calendario";
  id: string;
  tipo: "EMAIL" | "PUSH" | "GOOGLE" | "OUTLOOK";
  evento: string;
  status: "Pendente" | "Processando" | "Enviado" | "Falha" | "Descartado";
  tentativas: number;
  criado_em: string;
  proxima_tentativa: string;
  concluido_em: string | null;
  ultimo_erro: string | null;
  destino: string | null;
  id_aluno: string;
  aluno: string;
  provedor: string | null;
  aula: { data: string; hora: number; idioma: string; nivel_curso: string };
}

interface Lista {
  itens: Item[];
  total: number;
  pagina: number;
  por_pagina: number;
  resumo: { pendentes: number; falhas: number; enviados: number };
}

const TIPO = { EMAIL: "E-mail", PUSH: "Push", GOOGLE: "Google Agenda", OUTLOOK: "Outlook" } as const;
const EVENTO: Record<string, string> = { CONFIRMACAO: "Confirmação", CANCELAMENTO: "Cancelamento", CRIAR: "Criar evento", CANCELAR: "Cancelar evento" };
const TOM = { Pendente: "aviso", Processando: "info", Enviado: "sucesso", Falha: "erro", Descartado: "neutro" } as const;
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Integracoes({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tipo?: string; pagina?: string }>;
}) {
  await exigirPermissaoPagina("NOTIFICACOES_GERENCIAR");
  const f = await searchParams;
  const l = await chamarAdm<Lista>("adm_listar_integracoes", {
    p_status: f.status || null,
    p_tipo: f.tipo || null,
    p_pagina: Number(f.pagina) || 1,
  });
  const email = adaptadorEmail().nome;
  const push = adaptadorPush();

  return (
    <>
      <Cabecalho
        titulo="Notificações e agenda"
        descricao="E-mails, push e eventos de calendário gerados pelas reservas. Uma falha nunca desfaz a reserva: o item tenta de novo (3 tentativas) e depois fica aqui para reprocessar."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Na fila" valor={l.resumo.pendentes} />
        <Numero rotulo="Com falha" valor={l.resumo.falhas} tom={l.resumo.falhas > 0 ? "erro" : undefined} />
        <Numero rotulo="Enviados" valor={l.resumo.enviados} />
      </div>
      <Cartao className="mb-6 flex flex-col gap-4">
        <AcoesFila falhas={l.resumo.falhas} />
        <p className="text-sm text-suave">
          Provedores: e-mail <strong className="text-texto">{email === "stub" ? "modo de teste (não envia; veja o conteúdo aqui)" : email}</strong> ·
          Google Agenda e Outlook <strong className="text-texto">modo de teste</strong> · push{" "}
          <strong className="text-texto">{push.ativo ? "ativo (VAPID)" : "modo de teste"}</strong>
        </p>
      </Cartao>
      <Cartao className="mb-6">
        <form method="get" className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Selecao id="tipo" name="tipo" rotulo="Tipo" vazio="Todos" defaultValue={f.tipo ?? ""}
            opcoes={Object.entries(TIPO).map(([valor, rotulo]) => ({ valor, rotulo }))} />
          <Selecao id="status" name="status" rotulo="Situação" vazio="Todas" defaultValue={f.status ?? ""}
            opcoes={["Pendente", "Processando", "Enviado", "Falha", "Descartado"]} />
          <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
            Filtrar
          </button>
        </form>
      </Cartao>
      {l.itens.length === 0 ? (
        <EstadoVazio titulo="Nada por aqui" descricao="Os itens aparecem quando um aluno agenda ou cancela uma reposição." />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Fila de notificações e calendário</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Criado</th>
                <th scope="col" className="px-4 py-3 font-medium">Tipo</th>
                <th scope="col" className="px-4 py-3 font-medium">Aluno · aula</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {l.itens.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dataHora.format(new Date(i.criado_em))}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{TIPO[i.tipo]}</span>
                    <span className="block text-suave">{EVENTO[i.evento] ?? i.evento}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{i.aluno}</span>
                    <span className="block text-suave">
                      {i.id_aluno}
                      {i.destino ? ` · ${i.destino}` : ""} · {i.aula.idioma} {i.aula.data.split("-").reverse().join("/")}{" "}
                      {String(i.aula.hora).padStart(2, "0")}h
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tom={TOM[i.status]}>{i.status}</Etiqueta>
                    <span className="block text-xs text-suave">
                      {i.tentativas} tentativa(s)
                      {i.status === "Pendente" && i.tentativas > 0 ? ` · próxima ${dataHora.format(new Date(i.proxima_tentativa))}` : ""}
                    </span>
                    {i.ultimo_erro && <span className="block text-xs text-erro">{i.ultimo_erro}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      {i.tipo === "EMAIL" && (
                        <Link href={`/adm/integracoes/${i.id}`} className="inline-flex min-h-11 items-center underline">
                          Ver e-mail
                        </Link>
                      )}
                      {i.status === "Falha" && <ReprocessarItem fila={i.fila} id={i.id} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
      <div className="mt-4">
        <Paginacao base="/adm/integracoes" params={{ status: f.status, tipo: f.tipo }} pagina={l.pagina} porPagina={l.por_pagina} total={l.total} />
      </div>
    </>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: "erro" }) {
  return (
    <Cartao>
      <p className="text-sm text-suave">{rotulo}</p>
      <p className={cx("mt-1 text-3xl font-bold tabular-nums", tom === "erro" && "text-erro")}>{valor}</p>
    </Cartao>
  );
}
