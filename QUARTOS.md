# Quartos dos Símios

Abra **Quartos** na recepção ou na barra superior do Junto.fm. É necessário estar conectado a uma conta existente.

- Cada conta possui um quarto permanente em `/quartos`.
- O dono escolhe nome, piso e parede e posiciona até 60 móveis numa grade 10 × 10.
- O catálogo inicial contém 12 tipos: sofá, poltrona, mesa, cama, estante, planta, luminária, TV decorativa, tapete, caixa de som decorativa, fliperama decorativo e bananeira.
- Para mover: clique no chão ocupado pelo móvel e depois no destino. Girar altera sua orientação; Remover retira o selecionado. Salvar publica a decoração; Cancelar descarta o rascunho.
- Fora do modo de edição, clique no sofá ou na poltrona para caminhar até ela e sentar; clique na cama para deitar. O servidor escolhe uma célula livre ao redor do móvel, calcula o caminho e sincroniza a pose com os outros visitantes. Um novo comando de caminhada levanta o personagem.
- A entrada deve ficar livre. Tapetes podem ficar sob móveis. Os outros móveis não se sobrepõem.
- Convites só podem ser criados para amizades existentes. Aparecem em **Portas abertas para você**, com atualização pelo botão Atualizar convites. Não são enviados por e-mail nem por serviços externos.
- O acesso persiste até o dono remover o convidado. Remover também retira suas sessões abertas. Um link de quarto sozinho não concede acesso.
- Até 12 conexões simultâneas. O dono não precisa estar presente. Caminhos e mensagens são sincronizados por Socket.IO, em namespace separado das salas de música.
- Decoração salva redefine as posições dos visitantes para a entrada, evitando personagens dentro de móveis novos.
- A movimentação usa interpolação contínua (1,35 casas/s), giro suave e ciclo de caminhada sincronizado; sentar/deitar e as cinco danças do Club usam os mesmos estados e arquivos de animação do sistema da balada. As danças disponíveis são Shake, Macarena, Party, Capoeira e Groove, sincronizadas entre os participantes.
- Os avatares são instâncias 3D do modelo `macaco.glb` com os trajes equipados na conta, montados pelo mesmo sistema `createWardrobeFittedAvatar` do guarda-roupa. Cada participante recebe apenas as escolhas sanitizadas salvas na conta; os acessórios são carregados conforme necessário e cada personagem tem sua própria instância. A câmera permanece fixa; posição e escala acompanham a grade e o zoom. O deslocamento recebe interpolação e ciclo leve de caminhada; os membros inferiores recebem poses simples de sentado/deitado. A decoração continua desenhada em 2D leve e clicável, enquanto os macacos são 3D.

## Persistência e integração

`personal-rooms.js` usa o pool e as sessões de `account-auth.js`. Após a inicialização das contas, cria automaticamente as tabelas aditivas `junto_personal_rooms` e `junto_room_invites` no Postgres já configurado. Sem banco disponível, retorna 503, sem fingir que salvou dados. Uma revisão numérica impede sobrescrever alterações feitas por outra aba. Nenhuma mudança nas tabelas de salas temporárias, amizades, trajes ou player.

`public/room-rules.js` compartilha as regras de footprint, colisão e caminho entre navegador e servidor. Permissões e validações são reaplicadas no servidor. Os identificadores dos donos/convidados são UUIDs; nenhuma autorização é aceita do cliente.

## Verificação

```sh
node --test tests/personal-rooms.test.js
```

Os dois testes de regras rodam sem dependências de teste extras. O teste de integração usa Postgres embarcado e clientes Socket.IO reais quando `PGLITE_TEST_MODULE` e `SOCKET_CLIENT_TEST_MODULE` apontam para os módulos instalados fora do projeto:

```sh
PGLITE_TEST_MODULE=/caminho/node_modules/@electric-sql/pglite \
SOCKET_CLIENT_TEST_MODULE=/caminho/node_modules/socket.io-client \
node --test tests/personal-rooms.test.js
```

Cobertura: criação autenticada, persistência, edição exclusiva do dono, conflito de revisão, convite apenas para amigo, caixa de convites, entrada autorizada, bloqueio de movimento, presença com trajes, interações de sentar/deitar, chat entre conexões e revogação de acesso. Verificação visual local: criar, editar nome, colocar cama, salvar e recarregar. O fixture de demonstração e o banco de testes ficam fora do repositório e não são usados em produção.
