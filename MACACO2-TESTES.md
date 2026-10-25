# Macaco 2.0 — The Símios (somente branch experimental)

Esta branch NÃO substitui `public/macaco.glb` e não altera o avatar dos outros jogadores. Nenhuma mudança vai para a `main` antes de validação.

## Preparar arquivo 3D

Copiar `magago_junto_rig_teste.glb` (fornecido no chat) para `public/models/magago_junto_rig_teste.glb`. O conector do GitHub só consegue publicar os arquivos de texto da branch; o GLB binário deve ser colocado pelo VS Code. Como alternativa, clicar no seletor "GLB experimental" e importar o arquivo diretamente do computador — sem precisar colocá-lo no projeto.

## Como testar

1. `git fetch origin` e `git switch feature/macaco-2-rig-dev-tools`.
2. `npm.cmd start`. Abra a sala pelo `localhost`.
3. Abra **The Símios** e expanda o painel **🛠️ DEV** no canto superior direito do cenário.
4. Use o seletor de arquivo ou botão **Carregar GLB do projeto**.
5. O teste passa a afetar **somente seu avatar local**. Use "Usar Macaco 2.0" para comparar com o original sem recarregar a página. As roupas são exibidas por padrão no teste; desligue a opção **Exibir roupas do meu macaco** para isolar o rig.
6. Teste **Zoom** (55% a 260%), **Mostrar esqueleto**, **Inspecionar ossos**, caminhar, Macarena, capoeira, sentar e beber com uma garrafa equipada. Abra **Ajustar roupas e acessórios** para calibrar chapéus, toucas, óculos, fones e roupas; use **Altura do macaco sentado** para acertar o encaixe na cadeira.
7. Se abrir uma URL remota da branch, acrescente `?jfDev=1` para revelar o painel DEV.

## Estado e limitações

- `public/wardrobe.js` mantém `macaco.glb` oficial e carrega o rig AccuRig somente para o próprio usuário no modo DEV.
- `public/dance-floor.js` transfere rotações em referencial de repouso quando usa o novo modelo; as animações dos outros usuários permanecem como estão.
- As roupas antigas têm tamanhos/offsets específicos do modelo anterior e são **desabilitadas por padrão** no teste.
- Para o rig experimental, sentar agora usa uma **pose procedural específica do AccuRig**: coxas voltadas para a frente, joelhos flexionados e braços relaxados. Não importa curvas antigas do FBX, evitando rotação fora do eixo. O novo controle DEV **Altura do macaco sentado** permite acertar a posição sobre a cadeira.
- **Balanço das pernas:** a pose sentada experimental agora reproduz o movimento de pernas penduradas e alternadas, com aceleração suave após sentar. É uma adaptação procedural do efeito da antiga `sentadobalanca` para o rig AccuRig (não reaproveita as rotações incompatíveis do FBX). A animação Mixamo do macaco original permanece como antes.
- **Banana pessoal:** o plumbob verde agora é instanciado apenas para `socket.id`, ou seja, cada pessoa vê **somente a banana sobre o próprio avatar**. Foi deslocado +0,16 unidade no eixo X (ligeiramente para a direita), mantendo a altura ajustada.
- Os acessórios possuem presets **exclusivos do Macaco 2.0**, com ajuste independente de cabeça (chapéus, toucas, óculos e fones) e torso (roupas). O DEV permite ajustar X/Y/Z e escala de cada grupo, salvando tudo em `localStorage` apenas no navegador de teste. Os itens antigos só estão calibrados inicialmente: conferir cada um no cenário antes de aprovar.
- A banana verde/plumbob fica **0,42 unidade mais alta** quando acompanha o osso da cabeça, evitando atravessar chapéus e toucas; também foi elevado o fallback sem osso Head.
- O código foi inspecionado sintaticamente; ainda é necessário testar com navegador/real GLB para confirmar visualmente animações, encaixe de garrafa e troca de avatar.
- A pasta `public/models` é opcional no teste por seletor de arquivo; o GLB não está incluído no GitHub.

**Não fazer merge desta branch diretamente na main** enquanto esses testes não passarem.
