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

Os ícones **📺 TV PS1** e **🪩 bola de balada PS1** aparecem no dock ao lado do **🍅 tomate** e da **🍌 banana 3D**. Não há mais botão largo na área de participantes. As artes enviadas pelo criador são carregadas de maneira otimizada. A TV abre uma janela própria com três abas (apenas para o dono da sala):

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

## Ajustes após teste no localhost

* O play/pause do YouTube é enviado imediatamente com posição exata quando disponível, estado versionado (revision) e relógio relativo ao recebimento. Sync atrasado não pode desfazer pause. O espectador pode precisar clicar em **Ativar reprodução/som** devido à política de autoplay do navegador.
* Login administrativo por GitHub fica no **hall inicial** em forma de ícone. Também aparece no localhost quando o OAuth não está configurado, mas o login real só funciona se as variáveis do GitHub OAuth estiverem configuradas no servidor. A permissão não é concedida pelo botão.
* Testar com dois navegadores: play, pause, retomar, seek; vídeo P2P continua sem TURN.

## YouTube: sincronização endurecida (revisão de outubro/2026)

Depois dos testes no localhost com delay e o ouvinte continuando a assistir durante o pause, o protótipo foi reforçado:

* O servidor é a fonte da verdade: somente o dono da sala pode emitir `tv:control`; os demais recebem `tv:playback` (evento imediato) e `tv:state` com a mesma revisão.
* `tv:request-state` permite que quem abre a janelinha peça uma cópia atual do estado. Revisões antigas são descartadas.
* No ouvinte, o iframe do YouTube está sem interação direta: clicar na tela não pode fazer play/pause fora do comando do dono.
* Na pausa, o cliente chama `pauseVideo()` sem disparar um `seek` que poderia voltar a reproduzir. O `onStateChange` detecta play/buffering inesperado e força o pause. Existe um fallback de `stopVideo()` quando o player insiste em reproduzir; nesse caso, a retomada carrega o vídeo da posição do ADM.
* Uma proteção visual mostra “Pausado pelo administrador” enquanto o estado está parado e bloqueia a visualização até o play.
* Botão “Ativar reprodução/som” não inicia vídeo enquanto o ADM está pausado. Autoplay com som ainda depende das permissões do navegador.
* O script da TV tem versão na URL para invalidar caches antigos.
* Testes automatizados adicionados: `node --test tests/junto-tv*.test.js`, cobrindo estado do servidor, simulação do IFrame API e integração entre dois navegadores simulados, inclusive seek, pause/replay e participante tardio.

**Importante:** esses testes não são confirmação de operação com o YouTube real no navegador. Antes de considerar a TV pronta para merge, confirmar manualmente com **dois navegadores/dispositivos**, ambos atualizados, que play, pause e seek sincronizam sem atraso perceptível. Não foi alterada a configuração STUN sem TURN do gameplay e vídeo local.
