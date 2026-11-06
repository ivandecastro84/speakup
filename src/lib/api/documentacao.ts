import "server-only";
import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";

/**
 * Documentação da API de notas para a empresa parceira, gerada em PDF com o
 * endereço real da aplicação. Fontes padrão do PDF (WinAnsi): o texto evita
 * símbolos fora desse conjunto (ex.: ≥, →).
 */

export interface OpcoesDoc {
  baseUrl: string;
  empresa?: { nome: string; media_minima: number; prefixo: string | null } | null;
  geradoEm?: Date;
}

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 56, topo: 64, base: 64 };
const LARG = A4.w - M.x * 2;
const COR = {
  texto: rgb(0.1, 0.12, 0.2),
  suave: rgb(0.38, 0.4, 0.48),
  marca: rgb(0.03, 0.07, 0.16),
  acento: rgb(0.9, 0.22, 0.27),
  caixa: rgb(0.95, 0.96, 0.98),
  borda: rgb(0.83, 0.85, 0.9),
};

/** Exemplo ilustrativo: mesmo formato que a API devolve. */
export const EXEMPLO_RESPOSTA = {
  aluno: { id_aluno: "2026001", nome: "Mariana Alves", situacao_matricula: "Ativa" },
  empresa: "Acme Ltda",
  criterio: {
    media_minima: 7,
    descricao:
      "Aprovado: média da disciplina maior ou igual a 7,0. Abaixo da média: menor que 7,0. Sem avaliação: nenhuma nota lançada.",
  },
  cursos: [
    {
      turma: "BUS-ACME",
      curso: "Inglês · Business",
      idioma: "Inglês",
      nivel_curso: "Business",
      nivel_cefr_atual: "B1",
      frequencia: { aulas_registradas: 12, presencas: 11, percentual: 91.7 },
      disciplinas: [
        { disciplina: "Speaking", notas: [{ data: "2026-10-06", nota: 7.5 }, { data: "2026-11-03", nota: 8.5 }], media: 8, situacao: "Aprovado" },
        { disciplina: "Listening", notas: [{ data: "2026-10-06", nota: 6 }, { data: "2026-11-03", nota: 6.5 }], media: 6.25, situacao: "Abaixo da média" },
        { disciplina: "Reading", notas: [{ data: "2026-10-06", nota: 9 }, { data: "2026-11-03", nota: 9 }], media: 9, situacao: "Aprovado" },
        { disciplina: "Writing", notas: [], media: null, situacao: "Sem avaliação" },
      ],
    },
  ],
  consultado_em: "2026-11-06T16:45:10.123+00:00",
};

class Escritor {
  pagina!: PDFPage;
  y = 0;
  numero = 0;
  constructor(
    private doc: PDFDocument,
    private f: { normal: PDFFont; negrito: PDFFont; mono: PDFFont },
    private rodape: string,
  ) {
    this.novaPagina();
  }

  novaPagina() {
    this.pagina = this.doc.addPage([A4.w, A4.h]);
    this.numero++;
    this.y = A4.h - M.topo;
    this.pagina.drawText(this.rodape, { x: M.x, y: 32, size: 8, font: this.f.normal, color: COR.suave });
    const n = `Página ${this.numero}`;
    this.pagina.drawText(n, { x: A4.w - M.x - this.f.normal.widthOfTextAtSize(n, 8), y: 32, size: 8, font: this.f.normal, color: COR.suave });
  }

  espaco(h: number) {
    if (this.y - h < M.base) this.novaPagina();
  }

  quebrar(texto: string, fonte: PDFFont, tam: number, largura: number): string[] {
    const linhas: string[] = [];
    for (const par of texto.split("\n")) {
      let atual = "";
      for (const palavra of par.split(" ")) {
        const teste = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(teste, tam) <= largura) atual = teste;
        else {
          if (atual) linhas.push(atual);
          atual = palavra;
          while (fonte.widthOfTextAtSize(atual, tam) > largura) {
            let corte = atual.length - 1;
            while (corte > 1 && fonte.widthOfTextAtSize(atual.slice(0, corte), tam) > largura) corte--;
            linhas.push(atual.slice(0, corte));
            atual = atual.slice(corte);
          }
        }
      }
      linhas.push(atual);
    }
    return linhas;
  }

  texto(t: string, o: { tam?: number; fonte?: PDFFont; cor?: ReturnType<typeof rgb>; recuo?: number; depois?: number } = {}) {
    const tam = o.tam ?? 10.5;
    const fonte = o.fonte ?? this.f.normal;
    const alt = tam * 1.45;
    for (const l of this.quebrar(t, fonte, tam, LARG - (o.recuo ?? 0))) {
      this.espaco(alt);
      this.pagina.drawText(l, { x: M.x + (o.recuo ?? 0), y: this.y - tam, size: tam, font: fonte, color: o.cor ?? COR.texto });
      this.y -= alt;
    }
    this.y -= o.depois ?? 6;
  }

  titulo(t: string) {
    this.espaco(60);
    this.y -= 10;
    this.texto(t, { tam: 15, fonte: this.f.negrito, cor: COR.marca, depois: 2 });
    this.pagina.drawRectangle({ x: M.x, y: this.y, width: 36, height: 2.5, color: COR.acento });
    this.y -= 12;
  }

  subtitulo(t: string) {
    this.espaco(40);
    this.y -= 4;
    this.texto(t, { tam: 11.5, fonte: this.f.negrito, cor: COR.marca, depois: 3 });
  }

  lista(itens: string[]) {
    for (const i of itens) {
      const linhas = this.quebrar(i, this.f.normal, 10.5, LARG - 16);
      this.espaco(15);
      this.pagina.drawText("•", { x: M.x + 4, y: this.y - 10.5, size: 10.5, font: this.f.normal, color: COR.acento });
      for (const l of linhas) {
        this.espaco(15);
        this.pagina.drawText(l, { x: M.x + 16, y: this.y - 10.5, size: 10.5, font: this.f.normal, color: COR.texto });
        this.y -= 15.2;
      }
      this.y -= 2;
    }
    this.y -= 4;
  }

  codigo(t: string) {
    const tam = 8.6;
    const alt = tam * 1.4;
    const linhas = t.split("\n").flatMap((l) => {
      const max = Math.floor((LARG - 20) / this.f.mono.widthOfTextAtSize("M", tam));
      const partes: string[] = [];
      let r = l;
      while (r.length > max) {
        partes.push(r.slice(0, max));
        r = "  " + r.slice(max);
      }
      partes.push(r);
      return partes;
    });
    let i = 0;
    while (i < linhas.length) {
      this.espaco(alt * 2 + 12);
      const cabem = Math.max(1, Math.floor((this.y - M.base - 12) / alt));
      const bloco = linhas.slice(i, i + cabem);
      const h = bloco.length * alt + 12;
      this.pagina.drawRectangle({ x: M.x, y: this.y - h, width: LARG, height: h, color: COR.caixa, borderColor: COR.borda, borderWidth: 0.6 });
      let y = this.y - 6 - tam;
      for (const l of bloco) {
        this.pagina.drawText(l, { x: M.x + 10, y, size: tam, font: this.f.mono, color: COR.texto });
        y -= alt;
      }
      this.y -= h + 8;
      i += bloco.length;
    }
  }

  tabela(cabecalho: string[], linhas: string[][], larguras: number[]) {
    const tam = 9;
    const alt = tam * 1.4;
    const cols = larguras.map((p) => p * LARG);
    const desenhar = (cel: string[], negrito: boolean) => {
      const quebradas = cel.map((c, i) => this.quebrar(c, negrito ? this.f.negrito : this.f.normal, tam, cols[i] - 10));
      const h = Math.max(...quebradas.map((q) => q.length)) * alt + 8;
      this.espaco(h);
      if (negrito) this.pagina.drawRectangle({ x: M.x, y: this.y - h, width: LARG, height: h, color: COR.caixa });
      let x = M.x;
      quebradas.forEach((q, i) => {
        q.forEach((l, j) =>
          this.pagina.drawText(l, { x: x + 5, y: this.y - 4 - tam - j * alt, size: tam, font: negrito ? this.f.negrito : this.f.normal, color: COR.texto }),
        );
        x += cols[i];
      });
      this.pagina.drawLine({ start: { x: M.x, y: this.y - h }, end: { x: M.x + LARG, y: this.y - h }, thickness: 0.5, color: COR.borda });
      this.y -= h;
    };
    desenhar(cabecalho, true);
    for (const l of linhas) desenhar(l, false);
    this.y -= 10;
  }
}

export async function gerarDocumentacaoPdf(o: OpcoesDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const geradoEm = o.geradoEm ?? new Date();
  doc.setTitle("API de Notas · Speak Up Idiomas");
  doc.setAuthor("Speak Up Idiomas");
  doc.setSubject("Guia de integração para empresas parceiras");
  doc.setLanguage("pt-BR");
  doc.setCreationDate(geradoEm);
  const f = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(geradoEm);
  const url = `${o.baseUrl.replace(/\/$/, "")}/api/v1/notas`;
  const e = o.empresa;
  const mediaTxt = (e?.media_minima ?? 7).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const w = new Escritor(doc, f, `Speak Up Idiomas · API de Notas v1 · ${data}`);

  // Capa / cabeçalho
  w.pagina.drawRectangle({ x: 0, y: A4.h - 150, width: A4.w, height: 150, color: COR.marca });
  w.pagina.drawText("Speak", { x: M.x, y: A4.h - 70, size: 22, font: f.negrito, color: rgb(1, 1, 1) });
  w.pagina.drawText("Up", { x: M.x + f.negrito.widthOfTextAtSize("Speak", 22), y: A4.h - 70, size: 22, font: f.negrito, color: COR.acento });
  w.pagina.drawText("IDIOMAS", { x: M.x + f.negrito.widthOfTextAtSize("SpeakUp ", 22), y: A4.h - 70, size: 10, font: f.negrito, color: rgb(0.75, 0.78, 0.86) });
  w.pagina.drawText("API de Notas · Guia de integração", { x: M.x, y: A4.h - 106, size: 18, font: f.negrito, color: rgb(1, 1, 1) });
  w.pagina.drawText(e ? `Preparado para ${e.nome} · ${data}` : `Para empresas parceiras · ${data}`, {
    x: M.x, y: A4.h - 128, size: 10, font: f.normal, color: rgb(0.8, 0.83, 0.9),
  });
  w.y = A4.h - 182;

  w.titulo("1. Visão geral");
  w.texto(
    "A API de Notas permite que a sua empresa consulte, de forma automática e segura, o desempenho dos colaboradores que estudam na Speak Up Idiomas. Você envia o ID (matrícula) e o nome do aluno e recebe as notas por disciplina, a média, a situação em cada disciplina, o nível CEFR atual e a frequência.",
  );
  w.lista([
    "Somente alunos vinculados à sua empresa no cadastro da escola podem ser consultados.",
    "Os dados vêm diretamente do sistema acadêmico: as notas aparecem assim que a coordenação as lança.",
    "Cada consulta é registrada (empresa, aluno, data/hora e IP) para fins de auditoria e LGPD.",
  ]);

  w.titulo("2. Endereço de acesso");
  w.tabela(
    ["Item", "Valor"],
    [
      ["Método", "POST"],
      ["Endereço (URL)", url],
      ["Formato", "JSON (UTF-8). Envie o cabeçalho Content-Type: application/json"],
      ["Protocolo", "Somente HTTPS"],
    ],
    [0.25, 0.75],
  );

  w.titulo("3. Como a empresa se identifica (autenticação)");
  w.texto(
    "Cada empresa recebe da Speak Up uma chave de API exclusiva, no formato su_ seguido de 48 caracteres. A chave identifica a sua empresa e define quais alunos podem ser consultados. Envie-a em todas as requisições no cabeçalho Authorization:",
  );
  w.codigo("Authorization: Bearer su_SUA_CHAVE_AQUI");
  if (e?.prefixo) w.texto(`A chave ativa da ${e.nome} começa com ${e.prefixo}… e é entregue separadamente deste documento.`, { cor: COR.suave });
  w.lista([
    "Guarde a chave como uma senha: somente no servidor da sua empresa, nunca em aplicativo, página web ou planilha compartilhada.",
    "A escola não consegue recuperar a chave depois de gerada; se ela for perdida, solicite uma nova.",
    "Ao gerar uma nova chave, a anterior deixa de funcionar imediatamente. Peça a troca sempre que suspeitar de vazamento.",
    "Se o contrato da empresa for inativado, a chave deixa de funcionar.",
  ]);

  w.titulo("4. Como enviar o ID e o nome do aluno");
  w.texto("No corpo da requisição, envie um JSON com os dois campos abaixo (ambos obrigatórios):");
  w.tabela(
    ["Campo", "Tipo", "Descrição"],
    [
      ["id_aluno", "texto", "ID (matrícula) do aluno na Speak Up, exatamente como informado pela escola. Ex.: \"2026001\"."],
      ["nome", "texto", "Nome completo do aluno como está no cadastro. Maiúsculas, acentos e espaços extras não fazem diferença."],
    ],
    [0.18, 0.12, 0.7],
  );
  w.texto("O ID e o nome precisam pertencer ao mesmo aluno. Essa dupla conferência evita consultas a alunos errados.", { cor: COR.suave });

  w.titulo("5. Exemplo completo de consulta");
  w.subtitulo("Usando cURL (linha de comando)");
  w.codigo(
    [
      `curl -X POST "${url}" \\`,
      '  -H "Authorization: Bearer su_SUA_CHAVE_AQUI" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"id_aluno": "2026001", "nome": "Mariana Alves"}\'',
    ].join("\n"),
  );
  w.subtitulo("Usando JavaScript (Node.js 18 ou superior)");
  w.codigo(
    [
      `const resposta = await fetch("${url}", {`,
      '  method: "POST",',
      "  headers: {",
      "    Authorization: `Bearer ${process.env.SPEAKUP_API_KEY}`,",
      '    "Content-Type": "application/json",',
      "  },",
      '  body: JSON.stringify({ id_aluno: "2026001", nome: "Mariana Alves" }),',
      "});",
      "const dados = await resposta.json();",
      "if (!resposta.ok) throw new Error(`${dados.erro.codigo}: ${dados.erro.mensagem}`);",
      "console.log(dados.aluno.nome, dados.cursos);",
    ].join("\n"),
  );

  w.titulo("6. Resultado esperado (HTTP 200)");
  w.texto("Exemplo ilustrativo: o formato é exatamente o devolvido pela API; os valores mudam conforme o aluno consultado.", { cor: COR.suave });
  w.codigo(JSON.stringify(EXEMPLO_RESPOSTA, null, 2));

  w.titulo("7. Como interpretar as informações recebidas");
  w.tabela(
    ["Campo", "Significado"],
    [
      ["aluno.id_aluno / aluno.nome", "Identificação do aluno, como está no cadastro da escola."],
      ["aluno.situacao_matricula", "Ativa, Trancada ou Cancelada."],
      ["empresa", "Nome da sua empresa no cadastro da escola (dono da chave usada)."],
      ["criterio.media_minima", `Média mínima combinada com a sua empresa para "Aprovado"${e ? ` (hoje: ${mediaTxt})` : ""}.`],
      ["cursos[]", "Um item por curso/turma do aluno (pode haver mais de um)."],
      ["cursos[].turma / curso", "Código da turma e o curso (idioma e nível)."],
      ["cursos[].nivel_cefr_atual", "Nível no Quadro Europeu (A1 a C2) da avaliação mais recente; null se ainda não avaliado."],
      ["cursos[].frequencia", "Aulas com chamada registrada, presenças (inclui reposições realizadas) e o percentual."],
      ["disciplinas[]", "Sempre as 4 competências: Speaking, Listening, Reading e Writing."],
      ["disciplinas[].notas[]", "Cada nota lançada (0 a 10) com a data da avaliação (AAAA-MM-DD), em ordem cronológica."],
      ["disciplinas[].media", "Média aritmética das notas da disciplina (2 casas decimais); null se não houver nota."],
      ["disciplinas[].situacao", "Ver tabela abaixo."],
      ["consultado_em", "Data e hora da consulta (ISO 8601)."],
    ],
    [0.33, 0.67],
  );
  w.subtitulo("Situação em cada disciplina");
  w.tabela(
    ["Valor", "Quando aparece"],
    [
      ["Aprovado", `Média da disciplina maior ou igual à média mínima da empresa${e ? ` (${mediaTxt})` : " (padrão 7,0)"}.`],
      ["Abaixo da média", "Média da disciplina menor que a média mínima da empresa."],
      ["Sem avaliação", "Ainda não há nota lançada nessa disciplina (notas vazio e media null)."],
    ],
    [0.25, 0.75],
  );

  w.titulo("8. Respostas de erro");
  w.texto('Em caso de erro, a API devolve o código HTTP correspondente e um JSON no formato {"erro": {"codigo": "...", "mensagem": "..."}}.');
  w.tabela(
    ["HTTP", "codigo", "O que significa / o que fazer"],
    [
      ["400", "DADOS_INVALIDOS", "JSON malformado ou id_aluno/nome ausentes. Corrija o corpo da requisição."],
      ["401", "NAO_AUTORIZADO", "Chave ausente, incorreta, substituída ou revogada, ou contrato inativo. Confira o cabeçalho Authorization ou solicite nova chave."],
      ["404", "ALUNO_NAO_ENCONTRADO", "Nenhum aluno vinculado à sua empresa com esse ID e nome. Confira os dados ou peça à escola o vínculo do aluno à empresa."],
      ["405", "METODO_NAO_PERMITIDO", "Use o método POST."],
      ["429", "LIMITE_EXCEDIDO", "Mais de 60 consultas no último minuto. Aguarde alguns segundos e tente novamente."],
      ["500", "ERRO_INTERNO", "Falha inesperada. Tente novamente e, se persistir, envie ao suporte o código informado na mensagem."],
    ],
    [0.08, 0.32, 0.6],
  );
  w.texto("Por segurança, o erro 404 não informa se a matrícula existe: a resposta é a mesma para ID inexistente, nome divergente ou aluno de outra empresa.", { cor: COR.suave });

  w.titulo("9. Limites e boas práticas");
  w.lista([
    "Limite de 60 consultas por minuto por empresa. Para atualizar muitos alunos, faça as consultas em sequência.",
    "Toda resposta traz o cabeçalho X-Request-Id; informe-o ao suporte quando relatar um problema.",
    "As respostas não devem ser armazenadas em cache por intermediários (Cache-Control: no-store).",
    "Use os dados apenas para a finalidade prevista no contrato com a Speak Up (LGPD) e restrinja o acesso internamente.",
  ]);

  w.titulo("10. Suporte");
  w.texto(
    "Para solicitar ou trocar a chave de API, vincular colaboradores à empresa ou tirar dúvidas sobre a integração, fale com a coordenação da Speak Up Idiomas pelo canal de atendimento do seu contrato.",
  );

  return doc.save();
}
