import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { EXEMPLO_RESPOSTA, gerarDocumentacaoPdf } from "@/lib/api/documentacao";

describe("Documentação da API (PDF)", () => {
  it("gera PDF válido, com várias páginas, para empresa específica e genérico", async () => {
    for (const empresa of [null, { nome: "Acme Ltda", media_minima: 7.5, prefixo: "su_1a2b3c4d" }]) {
      const bytes = await gerarDocumentacaoPdf({ baseUrl: "https://exemplo.vercel.app", empresa });
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
      expect(doc.getTitle()).toBe("API de Notas · Speak Up Idiomas");
      if (process.env.DOC_SAIDA) writeFileSync(`${process.env.DOC_SAIDA}/doc-${empresa ? "acme" : "generico"}.pdf`, bytes);
    }
  });

  it("o exemplo do documento segue o formato da API (4 disciplinas, situações válidas)", () => {
    const c = EXEMPLO_RESPOSTA.cursos[0];
    expect(c.disciplinas.map((d) => d.disciplina)).toEqual(["Speaking", "Listening", "Reading", "Writing"]);
    for (const d of c.disciplinas) expect(["Aprovado", "Abaixo da média", "Sem avaliação"]).toContain(d.situacao);
  });
});
