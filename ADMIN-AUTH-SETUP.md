# Login administrativo opcional (branch de teste)

Usuários comuns continuam entrando sem conta. Somente o administrador usa GitHub OAuth.

Crie uma GitHub OAuth App em Settings > Developer settings > OAuth Apps, com callback:
`https://SEU-DOMINIO/auth/github/callback`

Configure no servidor (Render ou .env local):
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET` (nunca no front-end)
- `GITHUB_OAUTH_REDIRECT_URI` (URL exata cadastrada)

O administrador é validado pelo ID imutável do GitHub `343716655`, não pelo apelido.

Rotas:
- `GET /auth/github` inicia login administrativo.
- `GET /api/admin/status` consulta o estado da sessão.
- `POST /api/admin/logout` encerra a sessão.
- `POST /api/avatar/equip` recebe JSON `{"skin":"capitao-patria"}` e recusa usuários não autenticados com HTTP 403.

**Estado atual:** somente a fundação do login e a verificação do endpoint foram implementadas. Ainda não há interface de login, modelo 3D da skin, nem integração da escolha de skin com o avatar nas salas ou com Socket.IO. O endpoint não persiste equipamentos. Não considerar a exclusividade completa até validar o fluxo de sincronização da skin no servidor.

Sessões são armazenadas em memória e expiram após 7 dias; reinícios do servidor encerram as sessões. Para produção, usar store compartilhado se houver múltiplas instâncias. Usar HTTPS em produção.
