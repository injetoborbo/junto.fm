# Junto.fm — protótipo experimental v0.2

## Importante: não abra o HTML diretamente
O projeto precisa do servidor Node.js para a sala funcionar. Não dê duplo clique em `public/index.html`.

## Rodar no seu PC
1. Instale Node.js 18+.
2. Extraia o ZIP.
3. Abra a pasta `junto-fm` no VS Code.
4. Abra Terminal → Novo Terminal.
5. Execute `npm install`.
6. Execute `npm start`.
7. Abra `http://localhost:3000` no Chrome ou Edge.
8. Clique em **Entrar na sala**. Depois disso o botão de transmissão será habilitado.

## Criar e entrar em salas
- **Criar sala** gera um nome novo quando o campo está no valor padrão `noite`; se você digitar outro nome, esse nome será usado. Compartilhe o nome com todos os participantes.
- **Entrar na sala** conecta ao nome informado. Todos devem usar exatamente o mesmo nome.
- O projeto aceita um transmissor e vários ouvintes. Cada ouvinte recebe uma conexão WebRTC independente; a capacidade prática depende da rede e do navegador do transmissor.

## Tentar transmitir áudio
1. Abra o Spotify Web Player numa aba separada do Chrome/Edge.
2. Volte para Junto.fm e clique em **Transmitir áudio da aba**.
3. Na janela do navegador, selecione a aba do Spotify Web Player e habilite **Compartilhar áudio da aba**.
4. A outra pessoa precisa abrir a mesma aplicação hospedada, entrar no mesmo nome de sala e permitir a reprodução de áudio.

## Limitações
- Para outra pessoa conectar pela internet, hospede o servidor Node.js em um serviço compatível com WebSockets e HTTPS. `localhost` só funciona no seu PC.
- STUN está configurado, mas algumas redes exigem um servidor TURN para o áudio WebRTC conectar.
- Os comandos de pausar/próxima apenas enviam avisos e não controlam diretamente o Spotify.
- Ouvintes podem entrar antes ou depois de a transmissão começar; cada participante recebe uma conexão WebRTC direcionada e independente.
- A qualidade e a estabilidade dependem da rede e do navegador. STUN sozinho não atravessa todas as redes; para maior confiabilidade, configure um servidor TURN.
- É um protótipo, não uma aplicação pronta para produção.


## Ajustes de áudio (versão experimental)

A captura usa `getDisplayMedia` para capturar o áudio digital da aba. A versão experimental define `contentHint = "music"`, corrige a edição dos parâmetros Opus no SDP e solicita até 256 kbps quando suportado. O navegador pode ignorar algumas preferências; isso não substitui medições reais de WebRTC.


## Mostrar capa, artista e progresso da música do Spotify

A leitura dos metadados é opcional e usa a API oficial do Spotify. O áudio continua sendo transmitido pela captura da aba como antes.

1. Acesse o [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) e crie um app.
2. Copie o **Client ID** do app.
3. No painel do app, adicione exatamente esta Redirect URI para testar localmente: `http://localhost:3000/spotify/callback`.
4. Copie `.env.example` para um arquivo chamado `.env` na mesma pasta de `server.js` e preencha `SPOTIFY_CLIENT_ID`.
5. Reinicie o servidor com `npm start`.
6. No aparelho que vai transmitir, abra Junto.fm, clique em **Conectar Spotify** e autorize o acesso.
7. Deixe o Spotify Web Player tocando, entre na sala e clique em **Transmitir áudio da aba**. A capa, artista e progresso serão enviados aos ouvintes conectados.

Exemplo de `.env` local:

```env
SPOTIFY_CLIENT_ID=cole_seu_client_id_aqui
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback
```

Não publique o seu arquivo `.env` nem compartilhe o Client ID em capturas de tela públicas. A integração usa OAuth Authorization Code com PKCE, sem guardar Client Secret no projeto. Para um site hospedado, cadastre a Redirect URI HTTPS exata no dashboard e defina `SPOTIFY_REDIRECT_URI` para essa URL. Cada transmissor precisa conectar sua própria conta Spotify no aparelho transmissor.

**Nota:** o Spotify pode não retornar uma faixa quando não houver reprodução ativa ou quando a conta/dispositivo não disponibilizar o estado atual. A capa e o progresso são atualizados periodicamente, não quadro a quadro.
