/** Campanhas de Retenção: utilitários compartilhados (painel e, no futuro, portal do aluno). */

/** Troca {nome} (sem diferenciar maiúsculas) pelo primeiro nome do aluno. */
export function personalizarMensagem(texto: string, nomeCompleto: string | null | undefined): string {
  const primeiro = (nomeCompleto ?? "").trim().split(/\s+/)[0] || "aluno(a)";
  return texto.replace(/\{\s*nome\s*\}/gi, primeiro);
}

/** Texto da faixa de churn, conforme a regra (>= mínimo e < máximo; 100 incluído quando máximo = 100). */
export function descreverFaixa(min: number, max: number): string {
  const f = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return Number(max) === 100 ? `de ${f(min)}% a 100%` : `de ${f(min)}% até menos de ${f(max)}%`;
}
