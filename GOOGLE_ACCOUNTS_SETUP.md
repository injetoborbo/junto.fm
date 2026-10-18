# Login Google, perfis anônimos e amizades — configuração

Esta implementação está em uma branch de testes. **Não faça merge na main antes de configurar e testar o ambiente.**

## Requisitos

1. Banco PostgreSQL persistente (no Render, crie um Postgres e use a URL interna de conexão).
2. Um cliente OAuth 2.0 no Google Cloud Console do tipo **Aplicativo da Web**.
3. Execute `npm install` na branch para instalar `pg` e atualizar `package-lock.json`. Faça commit do lockfile atualizado.

## Variáveis de ambiente no Render

- `DATABASE_URL`: URL de conexão PostgreSQL persistente. Não exponha o valor em mensagens, GitHub ou HTML.
- `GOOGLE_CLIENT_ID`: ID do cliente OAuth.
- `GOOGLE_CLIENT_SECRET`: segredo OAuth (somente no ambiente do servidor).
- `GOOGLE_REDIRECT_URI`: `https://junto-fm.onrender.com/auth/google/callback`
- `PGSSL`: deixe sem definir para banco interno do Render; use `require` apenas quando o provedor oferecer TLS com certificado verificável.

No Console do Google, cadastre a URI de redirecionamento exatamente como acima. Em localhost, crie um cliente OAuth de testes ou cadastre também `http://localhost:3000/auth/google/callback` e ajuste a variável local. Se o aplicativo estiver em modo de testes, inclua os usuários de teste permitidos.

## Privacidade

- O Google é usado **somente para identificação privada** (`sub`), sem buscar ou mostrar foto, nome ou e-mail da conta Google.
- A foto pública é exclusivamente o arquivo enviado pela pessoa no perfil do Junto.fm.
- Apelidos podem mudar sem romper amizade. As relações são armazenadas por UUID interno no PostgreSQL.
- Visitantes ainda podem participar de salas, conversar e usar Trajes. O sistema de amizades exige login verificado no servidor.
- O cookie de sessão é HttpOnly, SameSite=Lax, Secure quando o site usa HTTPS; login dura até 30 dias, salvo logout.

## Testes antes de publicar

1. `npm install` e `npm start` com as variáveis Google + PostgreSQL configuradas.
2. Visitante: entrar numa sala normalmente; o botão de pedir amizade deve estar bloqueado.
3. Duas contas Google diferentes: entrar na mesma sala, enviar convite, aceitar e atualizar a página.
4. Verificar amigos persistentes depois de reiniciar o servidor.
5. Alterar nick e enviar uma foto escolhida pelo usuário; confirmar que a foto e o apelido permanecem após sair e entrar.
6. Confirmar que o botão Seguir leva ao nome de sala da conta amiga quando ela está online.
7. Confirmar que nunca aparece a foto ou o nome obtidos do Google.

Os amigos antigos guardados pelo apelido em `junto_friends_v1` não são importados automaticamente porque não têm ID de conta confiável. Refaça os convites após cadastrar as contas.
