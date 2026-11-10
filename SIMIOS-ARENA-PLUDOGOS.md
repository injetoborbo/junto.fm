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
