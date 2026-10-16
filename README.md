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

## Tentar transmitir áudio
1. Abra o Spotify Web Player numa aba separada do Chrome/Edge.
2. Volte para Junto.fm e clique em **Transmitir áudio da aba**.
3. Na janela do navegador, selecione a aba do Spotify Web Player e habilite **Compartilhar áudio da aba**.
4. A outra pessoa precisa abrir a mesma aplicação hospedada, entrar no mesmo nome de sala e permitir a reprodução de áudio.

## Limitações
- Para outra pessoa conectar pela internet, hospede o servidor Node.js em um serviço compatível com WebSockets e HTTPS. `localhost` só funciona no seu PC.
- STUN está configurado, mas algumas redes exigem um servidor TURN para o áudio WebRTC conectar.
- Os comandos de pausar/próxima apenas enviam avisos e não controlam diretamente o Spotify.
- Se o ouvinte entrar depois que a transmissão já começou, o transmissor agora tenta renegociar a conexão automaticamente.
- A qualidade e a estabilidade dependem da rede e do navegador. STUN sozinho não atravessa todas as redes; para maior confiabilidade, configure um servidor TURN.
- É um protótipo, não uma aplicação pronta para produção.


## Ajustes de áudio (versão experimental)

A captura usa `getDisplayMedia` para capturar o áudio digital da aba. A versão experimental define `contentHint = "music"`, corrige a edição dos parâmetros Opus no SDP e solicita até 256 kbps quando suportado. O navegador pode ignorar algumas preferências; isso não substitui medições reais de WebRTC.
