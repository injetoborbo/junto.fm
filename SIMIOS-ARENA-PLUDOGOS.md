# Junto.fm — Menu, Arena dos Macacos e Pludogos

## Navegação

O topo da Junto.fm agora tem um botão **☰ Menu**. Ele agrupa os atalhos já
existentes para Perfil, Amigos, Social, Temas, Trajes, Opções, sair da conta
e a nova seção **Minigames → Arena dos Macacos**. Preserva IDs e handlers
anteriores para respeitar os temas e funções do site.

## Arena dos Macacos (3D, separada da The Símios)

- A Arena tem modal e cena WebGL próprios; não adiciona arena, botões ou luta
  à balada e não depende de entrar na pista para jogar.
- Usa `/models/magago_junto_rig_teste.glb`, o macaco atual com rig, com
  fallback para o macaco original em caso de erro.
- Câmera lateral fixa (2.5D), dois macacos 3D e palco com iluminação própria.
- Convite de PvP 1 contra 1, aceite obrigatório em até 20 segundos, uma luta
  simultânea por sala. Os outros podem observar.
- 100 HP e 75 de energia por jogador. Turnos e resultados validados no
  servidor Socket.IO; estados são temporários, por sala.
- **Soco:** 16 de dano, custo 12, chance de acerto **86%**.
- **Chute:** 23 de dano, custo 22, chance de acerto **76%**.
- **Golpe forte:** 29 de dano, custo 30, chance de acerto **68%**.
- **Defesa:** recupera 28 de energia e reduz o próximo golpe acertado a
  aproximadamente 40% do dano.
- O cálculo aleatório do acerto acontece só no servidor. O cliente recebe
  `hit`, `damage` e sequência e reproduz a mesma esquiva/reação para
  os dois participantes.
- **Animações procedurais:** soco, chute, golpe forte, defesa, esquiva,
  reação de dano, nocaute com queda dramática, vitória com braços erguidos
  e pose de derrota. Captura quaternions originais por osso e as restaura a
  cada quadro, para não acumular deformações.
- A tela final exibe VITÓRIA/DERROTA e permite voltar ao lobby.
- Desistência voluntária, saída da sala ou 90 segundos sem ação encerram o
  combate. Fechar a interface não altera a música.

## Pets Pludogos

- Removidos os pets procedurais antigos (cachorros falsos) da balada.
- Adicionado em **Trajes** um espaço reservado para equipar Pludogos.
- A seleção está desabilitada até chegarem os modelos circulares 3D que
  serão enviados pelo criador. Nenhum modelo fictício é apresentado como
  definitivo; pets ainda não equipam/seguem o macaco.
- Quando os arquivos chegarem, o encaixe deverá usar a caixa delimitadora
  do próprio modelo para mantê-lo apoiado no chão.

## Validar antes de merge

```powershell
git fetch origin
git switch feature/simios-arena-pludogos-20261110
git pull --ff-only
node --test tests/simios-games.test.js tests/simios-fight-pose.test.mjs
npm.cmd start
```

No navegador, entre com duas contas/sessões na mesma sala:
abra **☰ Menu → Arena dos Macacos**, desafie, aceite e teste soco,
chute, defesa, erro, nocaute, desistência e tela final. Faça também os
testes no celular e nos temas Kodoku/Windows XP, verificando se os
atalhos existentes ainda abrem seus modais.

**Importante:** 14 testes de lógica passaram em execução isolada; a cena
WebGL, o visual das animações no GLB real, duas sessões Live e todos os
temas ainda precisam ser conferidos manualmente. Não publicar na main
antes da revisão visual.

## Animações de resultado enviadas pelo criador

A tela de vitória/derrota agora mostra o próprio avatar do participante,
com seus trajes, em destaque. Victory.fbx foi convertido para
`public/poses/arena/victory.glb` (8,57 s) e Sword And Shield Death.fbx
para `public/poses/arena/death.glb` (3,93 s). Ambos preservam somente
esqueleto/animação, sem duplicar a malha do arquivo original. A tomada
animada Layer0 foi selecionada; a tomada Base Layer estática foi descartada.

`simios-outcome-animation.js` adapta as rotações globais ao repouso do
macaco atual e transfere o deslocamento do quadril. A animação começa
quando aparece o resultado, toca uma vez e mantém o último quadro.
O canvas da arena é reutilizado no resultado, sem criar outro contexto WebGL.
Espectadores continuam vendo o resultado geral. Falha de carregamento mantém
a pose procedural anterior. Fechar ou voltar limpa mixers e restaura o palco.

Validação: 14 testes existentes passaram; carregamento dos GLBs e amostragem
das duas animações no rig real via Three.js confirmaram movimento e transforms
finitos. Conferência visual no navegador e teste com duas contas pendentes.

## Encaixe da arena: implementação atual

A arena monta o macaco com `createWardrobeFittedAvatar`, usando a normalização
1,8 e os mesmos ajustes da prévia em pé de Trajes, incluindo ajustes locais
quando o avatar pertence ao próprio jogador. O caminho de encaixe da pista
usa normalização 1,5, ajustes próprios de acessórios animados/sentados e não
serve como referência para a prévia. A arena não usa mais esse caminho.

Os arquivos selecionados são carregados antes da montagem. As peças são
encaixadas na pose inicial e ficam presas diretamente aos ossos; peças legadas
que ficavam na raiz da prévia são reassociadas ao pescoço/quadril preservando
seu encaixe. A animação só começa depois dessa montagem. Assim, um download
atrasado não captura uma pose de vitória/derrota como referência de encaixe.

Regressão (Three.js somente como dependência de desenvolvimento):

```powershell
npm.cmd install
node --test tests/arena-wardrobe.test.mjs tests/simios-games.test.js tests/simios-fight-pose.test.mjs
```

O novo teste compara as matrizes das peças com a prévia de Trajes, com ajustes
padrão e locais. Cobre seis chapéus, tipos de óculos, fones e roupas, e verifica
1176 amostras de acessórios durante os FBXs, mantendo os vínculos com os ossos
e o contato do corpo com o chão. Texturas/iluminação e aparência final ainda
precisam de conferência visual no navegador.

### Regata deformável na arena

A regata original não tem skin. Prendê-la apenas à coluna mantém o tronco no
lugar, mas deixa as cavas paradas quando os braços levantam. A arena agora
converte suas malhas em SkinnedMesh e transfere pesos dos três vértices mais
próximos do corpo para cada vértice da roupa (busca espacial KD-tree).
Compartilha o esqueleto do macaco, preservando UVs, material e o encaixe em pé
`width: 0.44, offset: [0, -0.01, 0]`. A transferência acontece só na montagem;
a deformação por quadro usa a GPU. As geometrias geradas são liberadas ao
fechar a arena, sem alterar os GLBs compartilhados ou a prévia estática.

O teste específico verifica que a geometria mantém o encaixe calibrado em pé,
que as duas cavas recebem influência dos respectivos braços e se movem quando
cada braço é levantado. A suíte direcionada agora tem 16 testes.

## Espírito Símio e gatilho do Dramatic Finish

- Ação `espirito_simio`: custa 10 HP, requer pelo menos 11 HP, não gasta
  energia e consome a vez. Não acumula nem renova enquanto estiver ativa.
- Balanceamento inicial configurado em `SPIRIT` no servidor: ataque +25% e
  dano recebido −25%, incluindo combinação multiplicativa com a guarda.
  Arredondamento do ataque para cima, depois redução e arredondamento para cima.
- Dois rounds significam as próximas duas ações do adversário e as próximas
  duas ações do dono. A ativação não conta nessa duração; erros e defesa
  consomem ações normalmente. O snapshot fornece `spirit[id].active` e
  `roundsRemaining`, e o cliente mostra o contador junto ao placar.
- KO de uma vítima com Espírito ativo registra `dramaticFinish` no resultado
  e emite `simios-dramatic-finish` uma única vez para a sala, com vencedor,
  vítima, habilidade e sequência. O servidor determina tudo; payloads do
  cliente não podem alterar o custo, bônus, duração ou forçar o finish.
- Desistência, saída, inatividade e KO depois da expiração não engatilham.
  O resultado mantém o gatilho para sincronização/reconexão sem emitir um
  segundo evento. A interface identifica o Dramatic Finish no resultado;
  a sequência visual será implementada após a descrição detalhada do criador.

### Apresentação do Dramatic Finish

Implementada com a arte `derrota.png` enviada pelo criador (convertida para
WebP mantendo resolução/proporção) e o MP3 original, sem alteração do áudio.
A imagem começa ampliada em 1,35× e recua até ficar inteira, acompanhando a
duração do áudio (aproximadamente 16,4 s). A sequência cobre a interface e,
ao terminar/pular, a arena mostra o resultado normal. Esc ou Pular interrompe
o áudio e limpa os temporizadores. Se o navegador bloquear autoplay, o botão
Tocar áudio e iniciar começa o som e o zoom juntos.

Prévia sem combate:
- **The Símios → DEV → Testar Dramatic Finish**, no kit existente.
- **Arena → Conferir animações → Testar Dramatic Finish**, também em modo dev.
- Disponíveis em localhost ou com `?jfDev=1`, sem emitir ações no servidor.

`tests/dramatic-finish.test.mjs` cobre sincronização de áudio/zoom, autoplay
bloqueado, repetição da prévia, descarte ao pular e falha de áudio.

### Menu ao encerrar o Dramatic Finish

A sequência continua cobrindo a tela inteira, com o mesmo áudio e zoom out.
Ao acabar (ou pular), mantém a imagem final e abre uma camada escura com blur,
título estilizado DRAMATIC FINISH e as opções Pedir revanche / Voltar ao Junto.fm.
O áudio para; a imagem/menu permanecem até uma escolha. A prévia do Dev Kit
inclui exatamente essa etapa final; sua opção de revanche apenas abre a arena.

No duelo real, revanche usa o convite existente do servidor para o mesmo rival,
com aceite obrigatório. Se já houver convite desse adversário, o botão o aceita.
Adversário ausente gera aviso no próprio menu; espectadores não pedem revanche.
Voltar fecha arena/The Símios e retorna à interface do Junto.fm sem sair da sala.
Esc pula para as opções durante a sequência e retorna ao site quando no menu.
