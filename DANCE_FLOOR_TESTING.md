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
