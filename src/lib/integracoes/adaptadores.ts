import "server-only";
import { randomUUID } from "node:crypto";
import { type DadosAula, localAula, mascararEmail, tituloAula } from "./tipos";
import type { MensagemEmail } from "./modelos";

/* ===========================================================================
 * Interfaces (G.4). Cada integração externa tem uma interface própria e um
 * stub funcional usado quando não há credencial configurada.
 * ======================================================================== */

export interface AdaptadorEmail {
  readonly nome: string;
  enviar(msg: MensagemEmail): Promise<{ id: string }>;
}

export interface AdaptadorCalendario {
  readonly provedor: "GOOGLE" | "OUTLOOK";
  readonly nome: string;
  criar(d: DadosAula): Promise<{ id: string }>;
  cancelar(d: DadosAula, idExterno: string | null): Promise<void>;
  /** Ponto de extensão para sincronização bidirecional (D52): não implementado no MVP. */
  ler?(idExterno: string): Promise<unknown>;
}

export interface InscricaoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface AdaptadorPush {
  readonly nome: string;
  readonly ativo: boolean;
  /** Envia para todas as inscrições; devolve os endpoints que expiraram. */
  enviar(inscricoes: InscricaoPush[], payload: { titulo: string; corpo: string; url: string }): Promise<{ invalidos: string[] }>;
}

/** Log estruturado de integração (sem dado pessoal em claro). */
export function logIntegracao(evento: string, dados: Record<string, unknown>) {
  console.info(JSON.stringify({ nivel: "info", origem: "integracoes", evento, ...dados }));
}

/* ===========================================================================
 * E-mail
 * ======================================================================== */

/** Stub: não envia; a mensagem fica registrada na fila (caixa de saída do painel). */
export class EmailStub implements AdaptadorEmail {
  readonly nome = "stub";
  async enviar(msg: MensagemEmail) {
    const id = `stub-${randomUUID()}`;
    logIntegracao("email.stub", { para: mascararEmail(msg.para), assunto: msg.assunto, id });
    return { id };
  }
}

export class EmailSmtp implements AdaptadorEmail {
  readonly nome = "smtp";
  async enviar(msg: MensagemEmail) {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const r = await t.sendMail({
      from: process.env.EMAIL_REMETENTE ?? "Speak Up Idiomas <nao-responda@speakup.com.br>",
      to: msg.para,
      subject: msg.assunto,
      text: msg.texto,
      html: msg.html,
      icalEvent: msg.anexo ? { filename: msg.anexo.nome, method: msg.anexo.tipo.includes("CANCEL") ? "CANCEL" : "REQUEST", content: msg.anexo.conteudo } : undefined,
    });
    return { id: r.messageId };
  }
}

export class EmailSendGrid implements AdaptadorEmail {
  readonly nome = "sendgrid";
  async enviar(msg: MensagemEmail) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.para }] }],
        from: { email: process.env.EMAIL_REMETENTE_ENDERECO ?? "nao-responda@speakup.com.br", name: "Speak Up Idiomas" },
        subject: msg.assunto,
        content: [
          { type: "text/plain", value: msg.texto },
          { type: "text/html", value: msg.html },
        ],
        attachments: msg.anexo
          ? [{ filename: msg.anexo.nome, type: "text/calendar", content: Buffer.from(msg.anexo.conteudo).toString("base64") }]
          : undefined,
      }),
    });
    if (!res.ok) throw new Error(`SendGrid respondeu ${res.status}`);
    return { id: res.headers.get("x-message-id") ?? `sendgrid-${randomUUID()}` };
  }
}

export function adaptadorEmail(): AdaptadorEmail {
  if (process.env.SENDGRID_API_KEY) return new EmailSendGrid();
  if (process.env.SMTP_HOST) return new EmailSmtp();
  return new EmailStub();
}

/* ===========================================================================
 * Calendário (escrita apenas — D52)
 * ======================================================================== */

/**
 * Stub de provedor: simula a API (gera id externo) sem chamar a rede.
 * CALENDARIO_STUB_FALHAR=1 força erro, para demonstrar a fila de retentativa.
 */
export class CalendarioStub implements AdaptadorCalendario {
  readonly nome: string;
  constructor(readonly provedor: "GOOGLE" | "OUTLOOK") {
    this.nome = `${provedor.toLowerCase()}-stub`;
  }
  private checarFalha() {
    if (process.env.CALENDARIO_STUB_FALHAR === "1") throw new Error(`${this.provedor}: API indisponível (falha simulada)`);
  }
  async criar(d: DadosAula) {
    this.checarFalha();
    const id = `${this.provedor.toLowerCase()}-${randomUUID()}`;
    logIntegracao("calendario.stub.criar", { provedor: this.provedor, reposicao: d.reposicao_id, titulo: tituloAula(d), local: localAula(d), id });
    return { id };
  }
  async cancelar(d: DadosAula, idExterno: string | null) {
    this.checarFalha();
    logIntegracao("calendario.stub.cancelar", { provedor: this.provedor, reposicao: d.reposicao_id, id: idExterno });
  }
}

export function adaptadoresCalendario(): Record<"GOOGLE" | "OUTLOOK", AdaptadorCalendario> {
  // Adaptadores reais (Google Calendar API / Microsoft Graph via OAuth2) entram
  // aqui quando houver credenciais; até lá, stubs com a mesma interface.
  return { GOOGLE: new CalendarioStub("GOOGLE"), OUTLOOK: new CalendarioStub("OUTLOOK") };
}

/* ===========================================================================
 * Web Push (VAPID)
 * ======================================================================== */

export class PushVapid implements AdaptadorPush {
  readonly nome = "web-push";
  readonly ativo = true;
  async enviar(inscricoes: InscricaoPush[], payload: { titulo: string; corpo: string; url: string }) {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:nao-responda@speakup.com.br",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    const invalidos: string[] = [];
    let erro: unknown = null;
    let enviados = 0;
    for (const s of inscricoes) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        enviados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) invalidos.push(s.endpoint);
        else erro = e;
      }
    }
    if (enviados === 0 && erro) throw erro instanceof Error ? erro : new Error(String(erro));
    return { invalidos };
  }
}

export class PushStub implements AdaptadorPush {
  readonly nome = "push-stub";
  readonly ativo = false;
  async enviar(inscricoes: InscricaoPush[], payload: { titulo: string }) {
    logIntegracao("push.stub", { dispositivos: inscricoes.length, titulo: payload.titulo });
    return { invalidos: [] };
  }
}

export const chavePublicaVapid = () => process.env.VAPID_PUBLIC_KEY || null;

export function adaptadorPush(): AdaptadorPush {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? new PushVapid() : new PushStub();
}
