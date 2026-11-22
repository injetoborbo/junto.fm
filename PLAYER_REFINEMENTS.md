# Junto.TV — player para toda a sala

Revisão de 15/11/2026. Este documento descreve a implementação atual; os trechos sobre P2P e quatro espectadores em `JUNTO_TV_TESTING.md` são históricos.

## Reprodução

- **Link direto HTTPS (MP4/WebM/HLS):** cada participante recebe a mídia da origem. O ADM controla play, pause, seek e velocidade. Quem abre a TV depois recebe o estado atual. URLs de páginas não são extraídas; a fonte precisa permitir acesso pelos navegadores dos participantes. DRM, codecs, CORS e expiração continuam dependendo da origem.
- **Arquivo local:** o ADM transmite as faixas por LiveKit e controla pausa, retomada e posição com barra e botões de dez segundos. O player oculto permanece conectado ao DOM, espera a primeira imagem decodificada antes de publicar e tenta áudio via Web Audio com fallback para `captureStream()` nativo. MP4 H.264/AAC é o formato de teste recomendado; MKV/AVI/MOV dependem dos codecs disponíveis no navegador. O backend registra no startup apenas se as três variáveis LiveKit estão configuradas, sem expor seus valores.
- **Tela/aba:** os participantes clicam em Assistir. O navegador do ADM determina quais superfícies fornecem áudio. A janela precisa permanecer aberta; fechá-la encerra a captura, inclusive se o seletor de tela ainda estiver pendente.
- Não existe mais o limite artificial de quatro espectadores na aplicação. LiveKit continua sujeito à capacidade, franquia e limites do projeto contratado. Isso não significa capacidade ilimitada nem teste de carga em produção.

## Recuperação e controles

Os espectadores por link não recebem seeks periódicos durante buffering. Quando a mídia volta a poder reproduzir, o cliente retorna à posição da sala. Comandos explícitos continuam sendo aplicados imediatamente. Promessas de autoplay pendentes não se acumulam; o botão de som continua aparecendo mesmo se um heartbeat chegar durante o bloqueio do navegador.

Uma falha fatal da fonte do ADM pausa a sala. HLS tenta uma recuperação de erro de decodificação; falhas definitivas mantêm a mensagem e permitem Tentar novamente, sem repetir indefinidamente. Pausas e sincronizações não apagam o erro.

Tela e arquivo têm volume individual e tela cheia com o diálogo/chat. O ADM de uma transmissão de tela não recebe um controle de volume inoperante: o som da aba continua sob controle da própria origem. Uma desconexão final do espectador libera Assistir para uma nova tentativa; reconexões automáticas do SDK informam o estado.

## Validação

Execute `npm ci` e `npm run test:tv`.

A suíte automatizada usa o backend e os scripts do player, com DOM, mídia e transporte LiveKit simulados. Cobre 12 espectadores por link mais entrada tardia, inscrição de 24 espectadores em transmissão, autorização real de tokens LiveKit para mais de quatro espectadores, isolamento entre salas, áudio individual, play/pause/seek local, buffering, autoplay, reconexão e cancelamento de captura pendente.

O ambiente desta revisão bloqueou o lançamento do Chromium. Não foi validada reprodução audiovisual real nem transporte LiveKit em redes diferentes. Antes de promover a mudança para produção, verificar em desktop e celular:

1. Pelo menos seis espectadores assistindo a tela/arquivo; confirmar que todos recebem imagem e som.
2. Link direto: play, pause, seek, participante tardio e um participante com rede lenta.
3. Arquivo local: pausa e retomada sem republicar, avanço, som do ADM e volume independente dos ouvintes.
4. Fechar/reabrir TV, encerrar a fonte, perder/restaurar a rede e reentrar na sala.
5. Verificar a franquia LiveKit; mídia por link direto não passa pelo Render.

## Links do Archive.org

Links `/details/colecao/arquivo` e `/download/colecao/arquivo` são resolvidos usando a lista real de arquivos da coleção. O servidor consulta apenas os metadados públicos de `archive.org`, com prazo de oito segundos; a mídia continua vindo diretamente do Archive para cada participante. O player prefere o derivado `.ia.mp4` quando listado, corrige espaços codificados como `+` e seleciona o formato correto. Nomes com `+` literal são preservados se existirem. Coleções sem episódio selecionado e arquivos ausentes geram orientação, sem escolher outro episódio silenciosamente. Trocar/encerrar a fonte cancela a aplicação de consultas antigas.

## TV e chat no celular

Em telas estreitas, a TV mantém vídeo acima do chat, com controles/fontes em uma seção recolhível. Em celulares na horizontal com largura suficiente, vídeo e chat ficam lado a lado. O chat abre sem focar o campo. `visualViewport` ajusta a altura/posição da janela ao teclado; focar o chat recolhe os controles. O log rola separadamente e o formulário permanece na área do chat. A bandeja de emojis tem altura limitada. Fechar o chat mantém um botão para reabri-lo.

A subárvore de mídia não é movida nem recriada (incluindo o iframe do YouTube). Somente os controles mudam de contêiner. Ao fechar a TV ou sair do breakpoint mobile, sua posição e o estado anterior do chat são restaurados. A suíte cobre montagem/restauração, preservação de nós/rascunho, resize do viewport, foco e transição de breakpoint. Validação visual em aparelhos reais continua pendente; não há confirmação do teclado nativo Android/iOS nesta revisão.
