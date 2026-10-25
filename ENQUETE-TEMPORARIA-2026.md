# ★ Enquete temporária Lula × Flávio Bolsonaro

**Importante:** os números são votos enviados pelos participantes da Junto.fm, não votos contados pelo TSE. Este recurso NÃO consulta o TSE, não mostra resultados oficiais nem prediz eleições.

## Janela de uso
O painel aparece até **26/10/2026 23h59:59, horário de Brasília** e se esconde automaticamente a partir de **27/10/2026 00h BRT**.

## Como funciona
- Botão estrela vermelha acima do tomate (no celular, acima na barra de ações).
- Os clientes recebem totais e porcentagens em tempo real por Socket.IO, inclusive após F5.
- Uma escolha por conta identificada ou por navegador com token local, podendo mudar de lado. Não é processo auditável nem previne completamente fraudes.
- Só quem entrou numa sala pode votar.
- Totais são **mantidos em memória do processo Node.js**: **reiniciar/reimplantar o servidor zera os números**. Isso é intencional pela natureza recreativa e efêmera da enquete.
- O endpoint GET `/api/community-election-poll-2026` devolve o estado atual, sem armazenar dados pessoais.

## Desligar imediatamente
Na hospedagem, configure `JF_TEMP_POLL_ENABLED=false` e reinicie o app. Não é necessário editar o código. O botão some quando o estado fechado é recebido.

## Remover depois do evento
Esta alteração está isolada na branch `feature/temporary-lula-flavio-poll-20261026` e no PR específico. Se ainda não tiver feito merge, basta fechar o PR e excluir a branch.

Se já tiver feito merge para a `main`, abra um **Revert** do merge no GitHub (ou localmente rode `git revert -m 1 SHA_DO_COMMIT_DE_MERGE`), envie para a `main` e redeploy. Isso remove em conjunto: `temporary-community-poll-2026.js`, `public/temporary-community-poll.js`, a chamada no `server.js`, e o CSS/HTML no `public/index.html`. Não reverter outras mudanças do Macaco 2.0.

## Validação antes de publicar
Conferir duas abas/dispositivos, votos, atualização de contagem, troca de escolha e o botão acima do tomate. Não fazer merge com recursos incompletos.
