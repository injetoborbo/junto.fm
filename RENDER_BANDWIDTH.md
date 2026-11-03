# Redução de tráfego do Render

- O chat negocia `chatAvatars: 1` no handshake. Cada foto recebe um hash e é enviada uma vez por conexão/ciclo de cache; mensagens e histórico referenciam esse hash. O cliente restaura o campo `avatar` antes dos listeners do chat e da pista. Abas antigas continuam recebendo o formato anterior. O histórico mantém as fotos originais, inclusive de quem já saiu.
- `npm install` executa `postinstall`, que gera representações gzip dos modelos, animações e arquivos de texto quando há economia de pelo menos 10%. Também é possível executar `npm run build`. Os `.gz` são gerados no deploy e não entram no Git. Os GLBs originais permanecem intactos.
- O servidor negocia gzip, mantém ETag/304 e Vary, e preserva os arquivos originais para Range e clientes sem gzip. Sem arquivos comprimidos, continua servindo normalmente. Representações mais antigas que o original são ignoradas.
- Os loaders de modelos consultam `/asset-versions.json` e acrescentam um hash do conteúdo à URL. Só a versão atual recebe cache de um ano; alterações no arquivo produzem uma nova URL. Falha no manifesto preserva os carregamentos pelas URLs originais. Não é necessário configurar serviços externos.
- As imagens do tomate foram convertidas para WebP sem perda, com igualdade dos pixels RGBA verificada. Os PNGs originais continuam disponíveis.
- A banana sobre o avatar passa a carregar quando necessária. A pose sentada carrega ao sentar; o rig novo já carregado não exige o modelo antigo para construir seu avatar. Os modelos dos cartões de participantes mantêm seu comportamento.

## Validação em 2026-11-03

- Testes específicos de protocolo de chat, reset/reconexão, HTTP gzip, Range, ETag e cache/versionamento.
- Smoke com servidor real e três clientes Socket.IO: abas antigas e novas, troca de perfil, mensagens, histórico de entrada e estado do player por link. No cenário com avatar de 20 KB, o payload caiu de 20.338 para 245 bytes na mensagem seguinte.
- Suíte de regressão executada também na main original: seis falhas preexistentes, cinco por mock sem `document.createComment` e uma por mock sem `achievement`. Nenhuma falha nova nesses testes.
- Compressão inicial: 227.436.007 bytes de arquivos elegíveis para 178.364.519 bytes, cerca de 21,6% de redução. Essa soma inclui assets opcionais e não equivale a um download por visita nem a uma previsão da conta do Render.
- Tomates: 3.262.559 bytes em PNG para 1.847.286 em WebP (43,4% menor).

O player por links externos já estava na main antes desta alteração. O processamento da mídia continua no navegador/origem. Não foi feito teste visual de WebGL em navegador nesta execução.
