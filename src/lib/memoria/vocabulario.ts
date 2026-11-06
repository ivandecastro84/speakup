/** Banco de vocabulário do Memory Game (inglês → português). Palavras curtas para caber nas cartas. */
export interface Par {
  en: string;
  pt: string;
  tema: string;
}

export const VOCABULARIO: Par[] = [
  // Casa
  { en: "house", pt: "casa", tema: "Casa" },
  { en: "kitchen", pt: "cozinha", tema: "Casa" },
  { en: "bed", pt: "cama", tema: "Casa" },
  { en: "window", pt: "janela", tema: "Casa" },
  { en: "door", pt: "porta", tema: "Casa" },
  { en: "chair", pt: "cadeira", tema: "Casa" },
  { en: "key", pt: "chave", tema: "Casa" },
  { en: "mirror", pt: "espelho", tema: "Casa" },
  // Comida
  { en: "bread", pt: "pão", tema: "Comida" },
  { en: "cheese", pt: "queijo", tema: "Comida" },
  { en: "apple", pt: "maçã", tema: "Comida" },
  { en: "water", pt: "água", tema: "Comida" },
  { en: "milk", pt: "leite", tema: "Comida" },
  { en: "egg", pt: "ovo", tema: "Comida" },
  { en: "chicken", pt: "frango", tema: "Comida" },
  { en: "rice", pt: "arroz", tema: "Comida" },
  // Trabalho
  { en: "meeting", pt: "reunião", tema: "Trabalho" },
  { en: "boss", pt: "chefe", tema: "Trabalho" },
  { en: "salary", pt: "salário", tema: "Trabalho" },
  { en: "office", pt: "escritório", tema: "Trabalho" },
  { en: "deadline", pt: "prazo", tema: "Trabalho" },
  { en: "invoice", pt: "fatura", tema: "Trabalho" },
  { en: "team", pt: "equipe", tema: "Trabalho" },
  { en: "job", pt: "emprego", tema: "Trabalho" },
  // Viagem
  { en: "airport", pt: "aeroporto", tema: "Viagem" },
  { en: "ticket", pt: "passagem", tema: "Viagem" },
  { en: "luggage", pt: "bagagem", tema: "Viagem" },
  { en: "beach", pt: "praia", tema: "Viagem" },
  { en: "map", pt: "mapa", tema: "Viagem" },
  { en: "train", pt: "trem", tema: "Viagem" },
  { en: "flight", pt: "voo", tema: "Viagem" },
  { en: "passport", pt: "passaporte", tema: "Viagem" },
  // Pessoas e sentimentos
  { en: "friend", pt: "amigo", tema: "Pessoas" },
  { en: "happy", pt: "feliz", tema: "Pessoas" },
  { en: "tired", pt: "cansado", tema: "Pessoas" },
  { en: "brother", pt: "irmão", tema: "Pessoas" },
  { en: "daughter", pt: "filha", tema: "Pessoas" },
  { en: "angry", pt: "bravo", tema: "Pessoas" },
  { en: "hungry", pt: "com fome", tema: "Pessoas" },
  { en: "proud", pt: "orgulhoso", tema: "Pessoas" },
  // Dia a dia
  { en: "weather", pt: "clima", tema: "Dia a dia" },
  { en: "morning", pt: "manhã", tema: "Dia a dia" },
  { en: "week", pt: "semana", tema: "Dia a dia" },
  { en: "money", pt: "dinheiro", tema: "Dia a dia" },
  { en: "store", pt: "loja", tema: "Dia a dia" },
  { en: "street", pt: "rua", tema: "Dia a dia" },
  { en: "book", pt: "livro", tema: "Dia a dia" },
  { en: "phone", pt: "celular", tema: "Dia a dia" },
];
