# Apuração oficial TSE — integração temporária 2026

**Objetivo:** exibir os totais **oficiais de votos** para Lula e Flávio Bolsonaro, quando ambos forem informados no documento oficial de apuração presidencial do TSE, com atualização a cada 30 segundos.

**NÃO é uma enquete** e não permite votar. O site nunca inventa totais: enquanto o feed oficial não for encontrado ou não fornecer dados compatíveis, mostra “Aguardando dados oficiais”.

## Fonte fornecida pelo criador (já configurada nesta branch)

A URL indicada pelo criador é:

```text
https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws?nocache=1792912903306
```

O servidor usa a URL compartilhada como **identificador da eleição**, mas agora consulta **primeiro o arquivo nacional de votos `br-c0001-e006258-v.json`** (na mesma pasta oficial). Se ele não estiver disponível ou não trouxer candidatos válidos, tenta `br-c0001-e006258-u.jws`. Em ambos os casos, renova o `nocache` a cada consulta de 30 segundos. A correção usa somente `https://resultados.tse.jus.br`, sem consultar agregadores ou serviços não oficiais.

**Motivo do conserto:** antes o sistema buscava apenas `-u.jws`, que pode servir como aviso de atualização em vez de apuração detalhada. O novo backend expõe `attempts` (documento consultado e erro específico) e `lastSourcePath` (documento do qual saiu o último resultado válido) em `/api/official-election-2026`. Assim podemos depurar erros reais sem inventar números.

**Diagnóstico observado em 25/10:** a resposta do servidor apontou **HTTP 404** para `-v.json` e **nenhuma lista de candidatos** em `-u.jws`. Por isso a integração passa a testar também `br-c0001-e006258-v.jws` **antes** das duas opções anteriores. O formato é uma hipótese a verificar, não uma URL confirmada ao vivo. O JSON de status mostra os campos-raiz recebidos do documento sem votos, para ajudar a localizar o feed correto.

Se os três caminhos falharem, abra DevTools > Network no site de resultados do TSE e localize a resposta de apuração presidencial nacional cujo conteúdo tenha `cand`, `n` e `vap`. Copie a URL completa para conferência: **não altere números manualmente nem use capturas de Google como fonte de votos**. A variável opcional `TSE_2026_PRESIDENT_RESULT_URL` pode indicar uma variante `-v.jws`, `-v.json` ou `-u.jws` publicada pelo TSE no mesmo diretório oficial.


**Atenção:** `-u.jws` é um documento JWS (envelope assinado), e não o `-v.json` que era esperado originalmente. O leitor agora aceita JWS compact e JSON serialization, decodifica o conteúdo recebido por HTTPS e **só mostra números quando o payload efetivamente contiver a estrutura de votos nacionais (`cand`) com Lula 13 e Flávio 22**. O link não foi consultado ao vivo neste ambiente e não é possível afirmar daqui se `-u.jws` traz essa estrutura ou apenas metadados de atualização. Se não trouxer votos, a interface mostra um erro e mantém o último resultado válido; nesse caso precisamos de outra requisição real da aba Network com `cand` e `vap`.

O parser do JWS **ainda não realiza verificação criptográfica independente da assinatura** com uma chave pública do TSE. A origem é protegida por HTTPS e validada por hostname/caminho; para auditoria criptográfica completa, obter e configurar a chave pública oficial do TSE. Não confundir ausência dessa checagem independente com validação da assinatura.

Pode-se substituir a URL padrão, caso o TSE divulgue outro feed validado, pela variável opcional:

```dotenv
TSE_2026_PRESIDENT_RESULT_URL=https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws
```

Depois de publicar a branch em um ambiente de teste, abra `/api/official-election-2026`. Confira `configured: true`, `lastSuccessAt` e `result`. **`configured: true` significa URL aceita, não dados confirmados.** Somente `result` com `lula.votes` e `flavio.votes` indica que a resposta foi interpretada como total de votos.

## Funcionamento

- `official-election-results-2026.js` tenta o JSON nacional de votos do TSE e, se necessário, o JWS de atualização, com HTTPS, timeout 8s por documento, checagem de host/caminho, abrangência nacional e números inteiros.
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

Verificar a configuração, candidate matching, atualização, fallback sem dados, celular/desktop, expiração e tema. A URL foi fornecida pelo criador e passa pela validação estrutural de domínio/caminho, mas não houve leitura ao vivo do payload. Antes de publicar, validar se o arquivo realmente contém votos (não apenas atualizações) e executar teste funcional no navegador.