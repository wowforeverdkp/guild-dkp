/* ============================================================
   CONFIGURAÇÃO DO SITE DE DKP
   ------------------------------------------------------------
   Cole aqui o link CSV publicado de cada aba da planilha
   (Arquivo > Compartilhar > Publicar na web > escolha a aba > CSV).

   Enquanto um link estiver vazio (""), o site usa o arquivo de
   exemplo da pasta /data. Assim dá para testar antes de conectar.
   ============================================================ */
window.DKP_CONFIG = {
  guildName: "NOME A DEFINIR",

  sheets: {
    config: "",       // aba config       (regras e parâmetros)
    raids: "",        // aba raids        (raid_id, nome, tamanho)
    prices: "",       // aba prices       (tipo, descricao, preco na escala de 10)
    players: "",      // aba players      (personagem, classe, funcao)
    runs: "",         // aba runs         (uma linha por raid feita)
    loot: "",         // aba loot         (uma linha por item)
    adjustments: "",  // aba adjustments  (headstart e correções manuais)
    attendance: "",   // aba de respostas do formulário de presença
  },
};
