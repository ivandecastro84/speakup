import { type DadosAula, type Evento, localAula, quandoAula } from "./tipos";

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  anexo?: { nome: string; conteudo: string; tipo: string };
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** E-mail transacional: convite/confirmação e cancelamento de aula. */
export function montarEmail(evento: Evento, d: DadosAula, ics: string): MensagemEmail {
  const primeiro = d.aluno.split(" ")[0];
  const detalhes = [
    ["Quando", quandoAula(d)],
    ["Curso", `${d.idioma} · ${d.nivel_curso}`],
    ["Onde", localAula(d)],
    ...(d.professor ? [["Professor(a)", d.professor]] : []),
    ...(d.turma ? [["Turma", d.turma]] : [["Formato", "Aula avulsa individual"]]),
  ] as [string, string][];

  const confirmacao = evento === "CONFIRMACAO";
  const assunto = confirmacao
    ? `Reposição confirmada: ${quandoAula(d)}`
    : `Reposição cancelada: ${quandoAula(d)}`;
  const abertura = confirmacao
    ? `Olá, ${primeiro}! Sua reposição está confirmada. O convite para a sua agenda vai anexado (arquivo .ics).`
    : `Olá, ${primeiro}. Sua reposição foi cancelada.`;
  const credito =
    !confirmacao && d.credito_devolvido != null
      ? d.credito_devolvido
        ? "O crédito de reposição voltou para o seu saldo."
        : "O cancelamento foi feito fora do prazo, então o crédito foi consumido."
      : null;

  const texto = [abertura, "", ...detalhes.map(([k, v]) => `${k}: ${v}`), ...(credito ? ["", credito] : []), "", "Speak Up Idiomas"].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#08112a;line-height:1.5">
<p>${escHtml(abertura)}</p>
<table role="presentation" style="border-collapse:collapse">${detalhes
    .map(([k, v]) => `<tr><th align="left" style="padding:4px 12px 4px 0">${escHtml(k)}</th><td style="padding:4px 0">${escHtml(v)}</td></tr>`)
    .join("")}</table>
${credito ? `<p>${escHtml(credito)}</p>` : ""}
<p style="color:#555">Speak Up Idiomas</p></body></html>`;

  return {
    para: d.email,
    assunto,
    texto,
    html,
    anexo: {
      nome: confirmacao ? "convite-reposicao.ics" : "cancelamento-reposicao.ics",
      conteudo: ics,
      tipo: `text/calendar; charset=utf-8; method=${confirmacao ? "REQUEST" : "CANCEL"}`,
    },
  };
}

/** Texto curto para o Web Push. */
export function montarPush(evento: Evento, d: DadosAula): { titulo: string; corpo: string; url: string } {
  return evento === "CONFIRMACAO"
    ? { titulo: "Reposição confirmada", corpo: `${d.idioma} · ${quandoAula(d)}`, url: "/aluno" }
    : { titulo: "Reposição cancelada", corpo: `${d.idioma} · ${quandoAula(d)}`, url: "/aluno" };
}
