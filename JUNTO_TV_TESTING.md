# 📺 Junto.fm TV — protótipo isolado

Branch: feature/junto-fm-tv-prototype. **Não foi feito merge na main.**

## Objetivo: proteger os 20 GB mensais da Metered.ca

* YouTube: cada participante carrega o player **diretamente do YouTube**; o Socket.io sincroniza ID, play/pause, posição e relógio. Os vídeos não atravessam o Render nem o TURN.
* Jogo e vídeo local: conexões WebRTC **separadas** da transmissão de música, com **somente STUN** (stun:stun.l.google.com:19302), sem nenhum servidor TURN. Em redes incompatíveis com P2P, o vídeo **não conecta** em vez de recorrer à Metered.
* Apenas quem clica **Assistir ao vídeo P2P** recebe um fluxo; no máximo **4 espectadores**. Limite de codificação por espectador: aproximadamente **1,5 Mbps de vídeo**, máximo **30 FPS**, tentativa de até **720p** (suporte do navegador dependente).
* Nenhum arquivo local é enviado ou armazenado no backend. Áudio de arquivos locais é capturado com Web Audio quando disponível; captura de jogo é **sem áudio**, preservando a transmissão musical atual.
* A infraestrutura **da música** permanece como estava e **ainda pode usar TURN**. Não há teto de uso mensal imposto pelo protótipo para essa parte.
* P2P pode exigir até cerca de **6 Mbps de upload** do DJ para quatro espectadores, além dos demais serviços; o uso de internet local continua existindo, só o relay TURN de vídeo foi eliminado.

## Interface

Um único botão **📺 TV** fica ao lado de **🪩 Abrir pista de dança**. Ele abre uma janela própria com três abas (apenas para o dono da sala):

1. **YouTube:** ADM cola link e controla iniciar/pausar/posição. Outros só assistem. Entradas tardias carregam o estado atual; sincronização periódica tenta corrigir diferenças.
2. **Vídeo local:** ADM escolhe um arquivo de vídeo no próprio PC e transmite sua reprodução por P2P. Áudio e vídeo dependem dos codecs e da capacidade do navegador. Prévia local fica sem áudio para evitar duplicação.
3. **Jogo:** ADM clica em **Escolher janela do jogo** e, no diálogo nativo do navegador, seleciona a opção **Janela** e o jogo. Por segurança, **fechar a janelinha encerra a captura**. Trocar para o jogo com Alt+Tab não encerra a captura.

Os espectadores não veem comandos administrativos. Eles escolhem se desejam assistir a um stream P2P (para não aumentar upload sem necessidade). Se o navegador bloquear autoplay, clicam em **Ativar reprodução/som**.

## Teste no Windows / VS Code (PowerShell)

    cd "C:\Users\mcraf\Downloads\junto.fm-git"
    git fetch origin
    git switch feature/junto-fm-tv-prototype
    git pull origin feature/junto-fm-tv-prototype
    npm.cmd install
    node --test tests/junto-tv.test.js
    npm.cmd start

Abra http://localhost:3000 e crie uma sala. Para testar com amigos em **redes diferentes**, será preciso usar uma implantação **HTTPS dessa própria branch** (não é suficiente o localhost de outro aparelho). Não alterar o serviço de produção na Render até validar o protótipo.

## Roteiro de validação

1. Entrar em uma sala como ADM, abrir a TV e colar um vídeo público do YouTube que permita incorporação. Em outro navegador, entrar na mesma sala, abrir TV e confirmar sincronização de play/pause/seek; confirmar que um convidado não controla o vídeo.
2. Com outro dispositivo/rede, selecionar um vídeo local MP4 ou WebM e clicar **Assistir ao vídeo P2P**; testar som, imagem e uso de CPU/Internet.
3. Abrir um jogo em modo janela ou janela sem borda; clicar em **Escolher janela do jogo** e selecionar apenas essa janela no diálogo nativo. Verificar FPS, visualização, atraso e perda de conexão.
4. Conferir em chrome://webrtc-internals (emissor/receptor) os candidatos e o par ICE selecionado: **não deve existir candidato de tipo relay nos peers de vídeo**. Conferir também o dashboard da Metered: o vídeo não deve consumir o tráfego TURN; música pode continuar consumindo.
5. Fechar a TV do ADM, trocar de modo, sair da sala, expulsar espectador e desconectar rede; nenhum stream deve continuar ativo no cliente. Validar o layout em telefone.

## Limitações conscientes do protótipo

* Alguns vídeos do YouTube proíbem incorporação; os navegadores podem impedir autoplay com som até interação manual. Sincronização depende da API do YouTube, atraso e relógios individuais — não é sincronismo de frame.
* **Não há garantia de conectividade P2P** (especialmente CGNAT, redes corporativas e celulares). Como proteção da franquia, não há fallback TURN para vídeo.
* Compartilhamento de janela exige HTTPS (ou localhost), permissão do navegador e seleção **manual** do jogo. Nem todo jogo em tela cheia exclusiva permite captura estável.
* Vídeo local captura o **arquivo em reprodução**, não faz upload nem fornece download. Formatos/codecs não suportados pelo browser podem falhar. Áudio local requer teste prático Chrome/Firefox.
* A aplicação usa um peer WebRTC por espectador, não um SFU. Quatro espectadores podem exigir quatro codificações e consumir bateria/CPU/upload do DJ.
* A interface e o backend possuem verificações de sintaxe e testes lógicos de autorização/sinalização; **ainda falta teste visual real e teste de rede com dois dispositivos** antes de merge.
