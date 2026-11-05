/** Tradução dos códigos de erro do backend para mensagens ao usuário. */
const MENSAGENS: Record<string, string> = {
  CREDENCIAIS_INVALIDAS: "Dados de acesso incorretos. Confira e tente novamente.",
  CONTA_BLOQUEADA:
    "Acesso bloqueado temporariamente após várias tentativas sem sucesso. Tente novamente mais tarde.",
  SENHA_FRACA_ALUNO: "A senha deve ter pelo menos 8 caracteres, com letras e números.",
  SENHA_FRACA_ADM:
    "A senha deve ter pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.",
  SENHA_IGUAL_PADRAO: "A nova senha não pode ser igual à senha inicial.",
  SENHA_ATUAL_INCORRETA: "A senha atual está incorreta.",
  SENHAS_DIFERENTES: "A confirmação não confere com a nova senha.",
  EMAIL_INVALIDO: "Informe um e-mail válido.",
  EMAIL_JA_CADASTRADO: "Já existe um usuário com este e-mail.",
  NOME_OBRIGATORIO: "Informe o nome.",
  PAPEL_INVALIDO: "Selecione um papel válido.",
  UNIDADE_INEXISTENTE: "Uma das unidades selecionadas não existe.",
  UNIDADE_JA_EXISTE: "Já existe uma unidade com este nome.",
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  IMPORTACAO_NAO_ENCONTRADA: "Importação não encontrada.",
  IMPORTACAO_ENCERRADA: "Esta importação já foi encerrada.",
  NAO_ENCONTRADO: "Registro não encontrado ou fora do seu escopo.",
  ALUNO_JA_EXISTE: "Já existe um aluno com esta matrícula.",
  PROFESSOR_EMAIL_EXISTE: "Já existe um professor com este e-mail.",
  SALA_JA_EXISTE: "Já existe uma sala com este nome nesta unidade.",
  TURMA_CODIGO_EXISTE: "Já existe uma turma com este código.",
  SALDO_ZERO: "Você não tem reposições disponíveis.",
  LIMITE_MES: "Você atingiu o limite de reposições deste mês.",
  HORARIO_INDISPONIVEL: "Esse horário acabou de ficar indisponível. Escolha outro.",
  FORA_DA_JANELA: "Esse horário está fora do período aberto para agendamento.",
  MATRICULA_INATIVA: "Só alunos com matrícula ativa podem agendar reposições.",
  REPOSICAO_NAO_AGENDADA: "Esta reposição não está mais agendada.",
  REPOSICAO_JA_INICIADA: "A aula já começou; não é possível cancelar.",
  TROCA_SENHA_PENDENTE: "Troque a senha inicial antes de continuar.",
  EMPRESA_JA_EXISTE: "Já existe uma empresa com este nome.",
  CNPJ_JA_CADASTRADO: "Este CNPJ já está cadastrado.",
  CAMPOS_OBRIGATORIOS: "Preencha todos os campos obrigatórios.",
};

/** Erros de regra que já trazem o texto para o usuário depois de "CODIGO:". */
const COM_DETALHE = new Set(["CONFLITO", "INVALIDO"]);

export function mensagemErro(codigoOuMensagem: string | undefined): string {
  const texto = codigoOuMensagem ?? "";
  const codigo = texto.split(":")[0];
  if (COM_DETALHE.has(codigo)) return texto.slice(codigo.length + 1);
  return MENSAGENS[codigo] ?? "Não foi possível concluir a operação. Tente novamente.";
}
