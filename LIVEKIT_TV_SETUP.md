# Junto.fm TV — LiveKit (branch de teste)

Branch: `feature/junto-tv-livekit`, derivada de `feature/junto-fm-tv-prototype`. **Não fazer merge na main nem publicar sem testar.**

## Integração

- **Tela e arquivo local:** capturados no navegador do administrador e publicados pelo LiveKit Cloud (SFU), não enviados para o Render. O arquivo original permanece local.
- **Vídeo:** até 1920×1080, 30 fps, publicação com teto de 3,5 Mbps e simulcast/adaptação. A resolução real depende da fonte e rede.
- **Áudio da TV:** enviado junto no LiveKit quando o navegador disponibiliza a faixa.
- **YouTube:** permanece pelo YouTube IFrame; não passa pelo LiveKit.
- **Música:** não alterada. Mantém a arquitetura independente com TURN/Metered.ca.
- **Privacidade:** `LIVEKIT_API_SECRET` fica exclusivamente no backend. Tokens temporários limitam acesso ao nome derivado da sala; só o dono pode publicar, ouvintes autorizados podem receber.
- **Inatividade:** transmissão encerrada se não houver espectadores após 90 segundos do início ou 60 segundos após o último sair. Limite de 4 espectadores permanece.

## Configuração de teste

1. No LiveKit Cloud, obtenha Project URL WebSocket, API Key e API Secret.
2. No ambiente do servidor **da versão de testes** (local ou serviço de preview), configure:
   ```
   LIVEKIT_URL=wss://SEU-PROJETO.livekit.cloud
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   ```
   **Nunca** comitar segredos ou colá-los no chat.
3. Na pasta local deste branch, execute `npm install` (não `npm ci` antes de atualizar o lockfile) e `npm start`.
4. Abra a mesma sala em dois navegadores/dispositivos distintos. Entre como dono em um, selecione Compartilhar tela ou Vídeo local e, no outro, clique em Assistir.
5. Confira áudio, imagem, encerramento pelo botão/fechamento, troca para YouTube, reconexões e encerramento por ausência de espectadores.
6. Consulte a franquia real de transferência no painel LiveKit: tráfego de saída do SFU cresce conforme espectadores e qualidade. 50 GB não são tráfego ilimitado.

## Limites / pendências

- Implementação gravada no GitHub, **ainda não testada ponta a ponta** com credenciais reais nem publicada.
- `package-lock.json` do projeto estava previamente defasado em relação ao `package.json`. Após `npm install`, revisar o diff do lockfile e versioná-lo antes de usar `npm ci`.
- A biblioteca cliente é carregada por CDN e exige internet e políticas CSP compatíveis. Confirmar a URL do bundle antes do primeiro teste real.
- Encerrar a sessão Socket.IO fecha a conexão no cliente. Tokens emitidos têm validade máxima de 10 minutos; revogação imediata no servidor LiveKit após expulsão/encerramento seria uma melhoria futura.
