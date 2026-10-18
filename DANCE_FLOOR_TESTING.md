# Junto Club — pista isométrica (protótipo)

Esta versão **não está na main**. Testar apenas na branch `feature/habbo-dance-floor`.

## Como testar
```powershell
git fetch origin
git switch feature/habbo-dance-floor
git pull origin feature/habbo-dance-floor
npm.cmd install
npm.cmd start
```
Acesse `http://localhost:3000`. Crie uma sala no primeiro navegador; entre com o **mesmo nome da sala** no segundo. Clique em **🪩 Abrir pista de dança** abaixo da lista de participantes. A pista é um cenário isométrico 6×6 com piso pastel, cabine de DJ, luzes coloridas, decoração e globo espelhado. O botão fica fixo no canto inferior esquerdo; a pista abre como janela pequena, sem cobrir todo o site.

- Clique num piso vazio para mover seu macaco: velocidade aproximada de 0,7 quadrado/segundo, com ciclo de caminhada (braços e pernas).
- Selecione **Disco**, **Balanço**, **Pular** ou **Parado**.
- Até **8 participantes** simultâneos por pista. O servidor valida a ocupação e só aceita eventos de quem entrou na sala.
- O avatar usa o macaco e as peças GLB de `wardrobe.js`, inclusive Capitão Pátria se a skin foi autorizada.
- A pista é **opcional**: a transmissão, o chat, os amigos e as salas continuam independentes. Ao fechar, a presença na pista é removida.
- As danças desta primeira versão são movimentos simples do esqueleto no Three.js; animações Mixamo com passos reais serão uma evolução.

## Verificações manuais necessárias
1. Um navegador abre a pista, o segundo entra: ambos veem dois avatares.
2. O segundo seleciona uma dança: aparece para ambos.
3. Tentar ocupar o mesmo quadrado deve ser recusado.
4. Trocar o traje deve atualizar o personagem.
5. Fechar pista, sair da sala, ser expulso ou desconectar deve remover o avatar.
6. Testar em celular e em dispositivos com pouca memória gráfica.
7. Comparar Capitão Pátria e roupas com o player, especialmente a capa.
8. Abrir a janela no canto inferior esquerdo, interagir com o site ao fundo e fechá-la sem travar a rolagem.
9. Conferir se os ossos AccuRig do Capitão Pátria animam corretamente ao caminhar.

## Arquivos
- `server.js`: estado temporário por sala e eventos `dance-*`.
- `public/dance-floor.js`: cena Three.js única, controles e personagens.
- `public/wardrobe.js`: exporta `createDanceAvatar()` para aproveitar os GLBs existentes.
- `public/index.html`: botão e modal da pista.

**Não publicar no Render até confirmar o funcionamento visual e a estabilidade em dois dispositivos.**

## Próxima etapa: animações profissionais

O ideal é baixar animações do [Mixamo](https://www.mixamo.com/) em **FBX**, com `Without Skin`, `In Place` (se disponível) e 30 FPS. Começar por três arquivos:
- `dance_discordance.fbx`: dança disco, procura `Disco Dance` ou similar.
- `dance_hiphop.fbx`: hip-hop.
- `dance_shuffling.fbx`: shuffle ou twist.

**IMPORTANTE:** não usar diretamente o FBX no navegador. Converter os movimentos para GLB e **retargetear os ossos** do esqueleto correto (Mixamo para o macaco básico, e AccuRig/Reallusion para Capitão Pátria). Usar `THREE.AnimationMixer` por avatar com blending/fades e sem root motion, preservando caminhada sincronizada por Socket.IO e sem tocar na rigagem dos trajes. Antes de incorporar, solicitar ao usuário os FBXs reais e checar orientações, durações e permissões de uso. A documentação do Mixamo deve ser consultada para os termos aplicáveis.

O cenário atual está no tema **balada noturna**: iluminação ambiente azul-escura, holofotes neon móveis, quadriculado com material emissivo pulsante e globo espelhado. Testar principalmente contraste da pele do macaco e FPS no celular.

## Danças Mixamo reais (próximo teste)
Recebemos cinco animações FBX com ossos `mixamorig`:
`macacochaqualha.fbx`, `macacomacarena.fbx`, `macacodanca.fbx`, `macacocapoera.fbx`, `macacodancagay.fbx`.

O navegador precisa dos arquivos convertidos em `public/dance/*.glb`.
No Windows, coloque os FBX na pasta Downloads (ou informe `-SourceFolder`) e execute:
```powershell
powershell -ExecutionPolicy Bypass -File .\converter-dancas.ps1
git add -f public/dance/*.glb
git commit -m "Adicionar animacoes Mixamo da pista"
git push origin feature/habbo-dance-floor
```
O conversor pressupõe o executável na pasta Downloads/capitaopatria; altere `-Converter` se necessário.
Se algum GLB faltar, o site recorre à animação procedimental anterior para não quebrar a pista. Verifique o console do navegador.
As ações Mixamo aplicam rotações a ossos coincidentes; se um modelo tiver rig diferente (Capitão Pátria), pode precisar de retarget no Blender.

## Balada noturna
Cenário escuro com luzes neon rosa/azul, holofotes giratórios, pista emissiva pulsante e globo espelhado.
