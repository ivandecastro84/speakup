import { type DadosAula, localAula, tituloAula } from "./tipos";

/** Formato UTC do iCalendar: 20261105T130000Z. */
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapa texto conforme RFC 5545 §3.3.11. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Dobra linhas em 75 octetos (RFC 5545 §3.1). */
function dobrar(linha: string): string {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  let tam = 0;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch, "utf8");
    const limite = partes.length === 0 ? 75 : 74;
    if (tam + n > limite) {
      partes.push(atual);
      atual = "";
      tam = 0;
    }
    atual += ch;
    tam += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

/**
 * Gera o convite .ics (iCalendar). REQUEST para a reserva confirmada;
 * CANCEL (mesmo UID, SEQUENCE maior) para o cancelamento.
 */
export function gerarIcs(d: DadosAula, metodo: "REQUEST" | "CANCEL" = "REQUEST", agora = new Date()): string {
  const descricao = [
    `Aluno: ${d.aluno} (${d.id_aluno})`,
    d.turma ? `Turma: ${d.turma}` : "Aula avulsa individual",
    d.professor ? `Professor(a): ${d.professor}` : null,
    `Modalidade: ${d.modalidade}`,
  ]
    .filter(Boolean)
    .join("\n");
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Speak Up Idiomas//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    `METHOD:${metodo}`,
    "BEGIN:VEVENT",
    `UID:${d.uid}`,
    `DTSTAMP:${utc(agora.toISOString())}`,
    `DTSTART:${utc(d.inicio)}`,
    `DTEND:${utc(d.fim)}`,
    `SEQUENCE:${metodo === "CANCEL" ? 1 : 0}`,
    `STATUS:${metodo === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${esc(tituloAula(d))}`,
    `LOCATION:${esc(localAula(d))}`,
    `DESCRIPTION:${esc(descricao)}`,
    "ORGANIZER;CN=Speak Up Idiomas:mailto:nao-responda@speakup.com.br",
    `ATTENDEE;CN=${esc(d.aluno)};ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${d.email}`,
    ...(metodo === "REQUEST"
      ? ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Aula em 1 hora", "TRIGGER:-PT1H", "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
