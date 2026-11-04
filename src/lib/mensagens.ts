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
  CAMPOS_OBRIGATORIOS: "Preencha todos os campos obrigatórios.",
};

export function mensagemErro(codigoOuMensagem: string | undefined): string {
  const codigo = (codigoOuMensagem ?? "").split(":")[0];
  return MENSAGENS[codigo] ?? "Não foi possível concluir a operação. Tente novamente.";
}
