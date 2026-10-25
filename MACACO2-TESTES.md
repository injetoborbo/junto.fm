# Macaco 2.0 — The Símios (somente branch experimental)

Esta branch NÃO substitui `public/macaco.glb` e não altera o avatar dos outros jogadores. Nenhuma mudança vai para a `main` antes de validação.

## Preparar arquivo 3D

Copiar `magago_junto_rig_teste.glb` (fornecido no chat) para `public/models/magago_junto_rig_teste.glb`. O conector do GitHub só consegue publicar os arquivos de texto da branch; o GLB binário deve ser colocado pelo VS Code. Como alternativa, clicar no seletor "GLB experimental" e importar o arquivo diretamente do computador — sem precisar colocá-lo no projeto.

## Como testar

1. `git fetch origin` e `git switch feature/macaco-2-rig-dev-tools`.
2. `npm.cmd start`. Abra a sala pelo `localhost`.
3. Abra **The Símios** e expanda o painel **🛠️ DEV** no canto superior direito do cenário.
4. Use o seletor de arquivo ou botão **Carregar GLB do projeto**.
5. O teste passa a afetar **somente seu avatar local**. Use "Usar Macaco 2.0" para comparar com o original sem recarregar a página.
6. Teste **Zoom** (55% a 260%), **Mostrar esqueleto**, **Inspecionar ossos**, caminhar, Macarena, capoeira, sentar e beber com uma garrafa equipada. Teste roupas antigas por último, usando a opção correspondente.
7. Se abrir uma URL remota da branch, acrescente `?jfDev=1` para revelar o painel DEV.

## Estado e limitações

- `public/wardrobe.js` mantém `macaco.glb` oficial e carrega o rig AccuRig somente para o próprio usuário no modo DEV.
- `public/dance-floor.js` transfere rotações em referencial de repouso quando usa o novo modelo; as animações dos outros usuários permanecem como estão.
- As roupas antigas têm tamanhos/offsets específicos do modelo anterior e são **desabilitadas por padrão** no teste.
- A pose sentada antiga usa outro rig; suas curvas são **desabilitadas para o modelo experimental** até receberem retarget específico. O macaco poderá ir à cadeira, mas ainda não terá pose sentada validada.
- O código foi inspecionado sintaticamente; ainda é necessário testar com navegador/real GLB para confirmar visualmente animações, encaixe de garrafa e troca de avatar.
- A pasta `public/models` é opcional no teste por seletor de arquivo; o GLB não está incluído no GitHub.

**Não fazer merge desta branch diretamente na main** enquanto esses testes não passarem.
