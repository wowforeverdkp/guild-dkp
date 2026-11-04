# Guild DKP: guia de configuração

Site de DKP da guild. A planilha do Google é o banco de dados, e o site (GitHub Pages) lê a planilha e calcula todos os saldos.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | A página |
| `app.js` | Monta as telas |
| `engine.js` | Calcula o DKP (todas as regras) |
| `config.js` | **O único arquivo que você edita:** nome da guild e links da planilha |
| `data/*.csv` | Dados de exemplo, usados enquanto os links estiverem vazios |
| `Guild_DKP_planilha_modelo.xlsx` | Modelo da planilha para subir no Google Sheets |

---

## 1. Planilha (Google Sheets)

1. No Google Drive: **Novo > Upload de arquivo** > `Guild_DKP_planilha_modelo.xlsx`.
2. Abra com o Google Sheets e salve como planilha Google (**Arquivo > Salvar como Planilhas Google**).
3. Apague os dados de exemplo das abas `players`, `runs`, `loot`, `adjustments` e `attendance` (mantenha a linha de cabeçalho).
4. **Não renomeie** as abas nem os cabeçalhos.

### O que vai em cada aba

- **config**: regras. Mude só a coluna `valor`.
- **raids**: `raid_id` (código curto, ex.: BD), `nome`, `tamanho` (10, 20 ou 40).
- **prices**: `tipo` (código), `descricao`, `preco` na escala de 10.
- **players**: `personagem` (nome exato do jogo), `classe`, `funcao` (Tank, Healer ou DPS).
- **runs**: uma linha por raid feita.
  - `run_id`: código da run, ex.: BD-01. É o mesmo código que o raid leader passa para o formulário.
  - `data`, `raid_id`.
  - `presentes`, `banco`, `atrasados`, `sairam_sem_combinar`, `noshow_sem_aviso`: listas de nomes separados por vírgula.
  - Quem avisou que não vai **não entra em lista nenhuma** (sem penalidade).
- **loot**: uma linha por item. `run_id`, `personagem` (quem levou), `item`, `tipo` (código da aba prices), `spec` (MS ou OS).
- **adjustments**: `data`, `raid_id`, `personagem`, `valor`, `motivo`. Use para o **headstart** do novo Raider e para correções.

### Regras que o site aplica sozinho

- Primeira run da guild numa raid: todos os presentes e o banco recebem o saldo inicial (100 na escala de 10).
- Tudo que é gasto em itens vira o pote, dividido por igual entre os presentes até o fim.
- Banco: 30% da cota. Pontualidade: +5. No-show sem aviso: -10, e -20 a partir do segundo no mês.
- Quem tem menos que o preço paga o saldo todo. Nenhum saldo fica negativo.
- Decay de 10% no dia 1 de cada mês.
- Tudo escalado pelo tamanho da raid (20 = 2x, 40 = 4x). Cada raid tem o seu próprio DKP.

---

## 2. Formulário de presença (Google Forms)

1. Na planilha: **Ferramentas > Criar um formulário**.
2. Crie exatamente estas perguntas:
   - **Run** (resposta curta, obrigatória). O código da run, ex.: BD-03.
   - **Personagem** (resposta curta, obrigatória).
   - **Status** (múltipla escolha, obrigatória): `Presente` ou `Banco`.
3. As respostas caem numa aba nova da planilha (ex.: "Respostas ao formulário 1").
4. Nessa aba de respostas, crie uma coluna à direita chamada **Aprovado**. O officer escreve **Sim** nas presenças confirmadas.
5. Use essa aba de respostas como a aba `attendance` (passo 3). A aba `attendance` do modelo pode ser apagada.

Só presenças com **Aprovado = Sim** contam. Elas se somam às listas `presentes` e `banco` da aba runs, então o officer pode usar o formulário, as listas, ou os dois.

---

## 3. Publicar as abas em CSV

Para **cada aba** (config, raids, prices, players, runs, loot, adjustments e a aba de respostas do formulário):

1. **Arquivo > Compartilhar > Publicar na web**.
2. Escolha a aba e o formato **Valores separados por vírgula (.csv)**.
3. Clique em **Publicar** e copie o link.
4. Cole o link no `config.js`, na linha da aba correspondente.

O Google atualiza o CSV publicado alguns minutos depois de cada alteração. Se o site não mostrar uma mudança, espere uns minutos e clique em **Recarregar**.

A planilha continua privada para edição. Publicar só deixa os dados visíveis para leitura, que é a ideia de transparência.

---

## 4. GitHub Pages

1. Crie uma conta em github.com, se ainda não tiver.
2. **New repository**, com um nome como `guild-dkp`. Marque **Public**.
3. **Add file > Upload files** e envie todos os arquivos desta pasta (incluindo a pasta `data`).
4. Em **Settings > Pages**: Source = **Deploy from a branch**, Branch = **main**, pasta **/ (root)**. Salve.
5. Em um ou dois minutos o site fica disponível em `https://SEU-USUARIO.github.io/guild-dkp/`.

Para atualizar o `config.js` depois: abra o arquivo no GitHub, clique no lápis, edite e confirme (**Commit changes**).

---

## 5. Rotina do officer depois de cada raid

1. Adicionar uma linha na aba **runs** (presentes, banco, atrasados, no-shows).
2. Adicionar uma linha por item na aba **loot**.
3. Aprovar as presenças do formulário, se usarem.
4. Novo Raider aprovado: lançar o headstart na aba **adjustments**. O site mostra a mediana da raid para ajudar no cálculo (30% a 60% da mediana).

Se algum nome estiver digitado diferente da aba players, ou um tipo de item não existir, o site mostra um aviso amarelo no topo.
