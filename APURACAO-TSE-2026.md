# Apuração oficial TSE — integração temporária 2026

**Objetivo:** exibir os totais **oficiais de votos** para Lula e Flávio Bolsonaro, quando ambos existirem no JSON de apuração presidencial do TSE, com atualização a cada 30 segundos.

**NÃO é uma enquete** e não permite votar. O site nunca inventa totais: enquanto o feed oficial não for encontrado ou não fornecer dados compatíveis, mostra “Aguardando dados oficiais”.

## Configuração necessária

Definir em Render (ou .env local) a variável:

```dotenv
TSE_2026_PRESIDENT_RESULT_URL=URL_JSON_OFICIAL_DA_APURACAO_PRESIDENCIAL_NACIONAL_TSE_2026
```

A URL precisa vir de uma fonte verificável do TSE no domínio `resultados.tse.jus.br`, com caminho de apuração da eleição presidencial **2026**, abrangência **br**, cargo **c0001**, terminando em `-v.json`. O código confere o ID da eleição no diretório e no nome do arquivo. Não é possível obter esse ID confiavelmente sem consultar a publicação oficial; não foi inventado aqui.

**Como encontrar a URL correta:** abra a página oficial [Resultados do TSE](https://resultados.tse.jus.br/) enquanto a apuração estiver sendo divulgada, selecione Presidente — Brasil — 2º turno, abra DevTools > Network e procure o arquivo `br-c0001-e...-v.json`. Confirme domínio e valores antes de configurar a variável no Render. Cuidado com URLs copiadas de sites de terceiros.

Após configurar, inicie/reinicie o servidor. Verifique `/api/official-election-2026`. Os campos `configured` e `result` devem mostrar `true` e dados válidos. Se `result` vier `null`, não publique como apuração ativa: verifique URL, bloqueios de acesso e os nomes dos candidatos.

## Funcionamento

- `official-election-results-2026.js` faz `fetch` pelo servidor a cada 30 segundos, com HTTPS, timeout 8s, checagem de host/caminho, abrangência nacional e números inteiros.
- `public/official-election-results.js` mostra estrela vermelha acima do tomate e lê `/api/official-election-2026` e eventos Socket.IO `jf-election-official-update`.
- Os números são exibidos **apenas** quando o TSE retornar candidatos cujos nomes e números coincidam com Lula (13) e Flávio (22). Se a lista de candidatos for diferente, a tela não mostra totais inventados.
- Não prevê vencedor; não transforma votos parciais em vitória.
- A apuração é temporária e deixa de aparecer em **27/10/2026 00:00 BRT** (2026-10-27T03:00:00Z).
- Se falhar uma atualização, o último resultado válido permanece na tela com erro e horário visível.
- Não salva o feed em banco, nem solicita votos aos usuários.

## Desligamento e remoção

Para desligar imediatamente, configure `JF_ELECTION_LIVE_ENABLED=false` e reinicie o servidor.

Este PR está isolado da branch Macaco 2.0. Se ainda não tiver merge, feche o PR e exclua a branch. Se tiver mergeado, use o botão **Revert** no PR #38, suba o revert para a main e faça o deploy. Isso reverte o botão, CSS, servidor e leitor TSE sem remover o Macaco 2.0.

## Testes

Verificar a configuração, candidate matching, atualização, fallback sem dados, celular/desktop, expiração e tema. A fonte/endpoint da eleição de 2026 não foi verificada ao vivo no ambiente de desenvolvimento; o URL oficial precisa ser confirmado antes do uso público.