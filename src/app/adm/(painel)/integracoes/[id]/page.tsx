import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta } from "@/components/campos";
import { Cabecalho, Cartao } from "@/components/ui";
import { gerarIcs } from "@/lib/integracoes/ics";
import { montarEmail } from "@/lib/integracoes/modelos";
import type { DadosAula, Evento } from "@/lib/integracoes/tipos";
import { RpcError } from "@/lib/server/rpc";
import { chamarAdm, exigirPermissaoPagina } from "../../dados";

export const metadata: Metadata = { title: "E-mail enviado" };

interface Notificacao {
  id: string;
  canal: "EMAIL" | "PUSH";
  evento: Evento;
  status: string;
  destino: string;
  payload: DadosAula;
  tentativas: number;
  provedor: string | null;
  id_externo: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  concluido_em: string | null;
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function VerEmail({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissaoPagina("NOTIFICACOES_GERENCIAR");
  const { id } = await params;
  let n: Notificacao;
  try {
    n = await chamarAdm<Notificacao>("adm_obter_notificacao", { p_id: id });
  } catch (e) {
    if (e instanceof RpcError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  if (n.canal !== "EMAIL") notFound();
  const d = { ...n.payload, email: n.destino };
  const ics = gerarIcs(d, n.evento === "CONFIRMACAO" ? "REQUEST" : "CANCEL", new Date(n.criado_em));
  const msg = montarEmail(n.evento, d, ics);

  return (
    <>
      <p className="mb-4">
        <Link href="/adm/integracoes" className="inline-flex min-h-11 items-center underline">
          ← Notificações e agenda
        </Link>
      </p>
      <Cabecalho titulo={msg.assunto} descricao="Conteúdo do e-mail transacional, como o aluno recebe." />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Cartao>
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-suave">Para</dt>
            <dd>{msg.para}</dd>
            <dt className="text-suave">Assunto</dt>
            <dd>{msg.assunto}</dd>
            <dt className="text-suave">Anexo</dt>
            <dd>{msg.anexo?.nome}</dd>
          </dl>
          <pre className="whitespace-pre-wrap rounded-padrao border border-borda bg-fundo p-4 font-sans text-sm">{msg.texto}</pre>
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Ver o convite (.ics)</summary>
            <pre className="overflow-x-auto rounded-padrao border border-borda bg-fundo p-4 text-xs">{ics}</pre>
          </details>
        </Cartao>
        <Cartao>
          <h2 className="mb-3 text-lg">Envio</h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-suave">Situação</dt>
              <dd><Etiqueta tom={n.status === "Enviado" ? "sucesso" : n.status === "Falha" ? "erro" : "aviso"}>{n.status}</Etiqueta></dd>
            </div>
            <div>
              <dt className="text-suave">Provedor</dt>
              <dd>{n.provedor === "stub" ? "Modo de teste (não sai da plataforma)" : n.provedor ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-suave">Tentativas</dt>
              <dd>{n.tentativas}</dd>
            </div>
            <div>
              <dt className="text-suave">Criado em</dt>
              <dd>{dataHora.format(new Date(n.criado_em))}</dd>
            </div>
            {n.concluido_em && (
              <div>
                <dt className="text-suave">Concluído em</dt>
                <dd>{dataHora.format(new Date(n.concluido_em))}</dd>
              </div>
            )}
            {n.ultimo_erro && (
              <div>
                <dt className="text-suave">Último erro</dt>
                <dd className="text-erro">{n.ultimo_erro}</dd>
              </div>
            )}
          </dl>
        </Cartao>
      </div>
    </>
  );
}
