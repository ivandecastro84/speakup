import "server-only";
import { rpc } from "@/lib/server/rpc";
import {
  type AdaptadorCalendario,
  type AdaptadorEmail,
  type AdaptadorPush,
  type InscricaoPush,
  adaptadorEmail,
  adaptadorPush,
  adaptadoresCalendario,
  logIntegracao,
} from "./adaptadores";
import { gerarIcs } from "./ics";
import { montarEmail, montarPush } from "./modelos";
import type { DadosAula, Evento } from "./tipos";

type Item =
  | { fila: "notificacao"; id: string; canal: "EMAIL" | "PUSH"; evento: Evento; destino: string | null; payload: DadosAula; tentativas: number; inscricoes: InscricaoPush[] | null }
  | { fila: "calendario"; id: string; provedor: "GOOGLE" | "OUTLOOK"; acao: "CRIAR" | "CANCELAR"; payload: DadosAula; tentativas: number; id_externo_criacao: string | null };

export interface Adaptadores {
  email: AdaptadorEmail;
  push: AdaptadorPush;
  calendario: Record<"GOOGLE" | "OUTLOOK", AdaptadorCalendario>;
}

export const adaptadoresPadrao = (): Adaptadores => ({
  email: adaptadorEmail(),
  push: adaptadorPush(),
  calendario: adaptadoresCalendario(),
});

export interface ResultadoFila {
  processados: number;
  enviados: number;
  falhas: number;
}

/**
 * Processa a fila de integrações no escopo da sessão (aluno: só os próprios
 * itens; ADM: as unidades dele). Cada item é concluído individualmente: uma
 * falha só reagenda aquele item (backoff) e nunca afeta a reserva.
 */
export async function processarFila(token: string, ad: Adaptadores = adaptadoresPadrao(), limite = 20): Promise<ResultadoFila> {
  const itens = await rpc<Item[]>("fila_reservar", { p_token: token, p_limite: limite });
  const r: ResultadoFila = { processados: itens.length, enviados: 0, falhas: 0 };
  for (const item of itens) {
    let ok = false;
    let erro: string | null = null;
    let provedor: string | null = null;
    let idExterno: string | null = null;
    let invalidos: string[] | null = null;
    try {
      if (item.fila === "notificacao" && item.canal === "EMAIL") {
        const d = { ...item.payload, email: item.destino ?? item.payload.email };
        const msg = montarEmail(item.evento, d, gerarIcs(d, item.evento === "CONFIRMACAO" ? "REQUEST" : "CANCEL"));
        provedor = ad.email.nome;
        idExterno = (await ad.email.enviar(msg)).id;
      } else if (item.fila === "notificacao") {
        provedor = ad.push.nome;
        const res = await ad.push.enviar(item.inscricoes ?? [], montarPush(item.evento, item.payload));
        invalidos = res.invalidos.length ? res.invalidos : null;
      } else if (item.acao === "CRIAR") {
        idExterno = (await ad.calendario[item.provedor].criar(item.payload)).id;
      } else {
        await ad.calendario[item.provedor].cancelar(item.payload, item.id_externo_criacao);
      }
      ok = true;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    const fim = await rpc<{ status: string; tentativas: number }>("fila_concluir", {
      p_token: token,
      p_fila: item.fila,
      p_id: item.id,
      p_ok: ok,
      p_erro: erro,
      p_provedor: provedor,
      p_id_externo: idExterno,
      p_endpoints_invalidos: invalidos,
    });
    if (ok) r.enviados++;
    else r.falhas++;
    logIntegracao(ok ? "fila.enviado" : "fila.falha", {
      fila: item.fila,
      id: item.id,
      tipo: item.fila === "notificacao" ? item.canal : item.provedor,
      status: fim.status,
      tentativas: fim.tentativas,
      ...(erro ? { erro } : {}),
    });
  }
  return r;
}

/** Versão "dispara e esquece" usada após a resposta (next/server after). */
export async function processarFilaSilencioso(token: string) {
  try {
    await processarFila(token);
  } catch (e) {
    logIntegracao("fila.erro", { erro: e instanceof Error ? e.message : String(e) });
  }
}
