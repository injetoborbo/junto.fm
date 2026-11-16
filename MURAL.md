# Mural dos Símios

Entrada na página inicial e no menu; página `/mural`. Visualização pública e publicação por contas existentes. O administrador usa a sessão GitHub administrativa já existente para remover uma contribuição pela lista de autores.

## Persistência e entrega

`mural.js` reutiliza o pool PostgreSQL das contas e cria `junto_mural` após a inicialização das contas. Não há nova variável de produção; usa `DATABASE_URL` e `PGSSL` existentes. Falha no banco fecha o mural com 503 e não substitui dados por armazenamento temporário.

Publicações são camadas independentes, com UUID de idempotência, autoria e revisão. Publicação e remoção usam transação e advisory lock para garantir ordem de commit antes do cursor incremental. A remoção retém um tombstone vazio. O namespace Socket.IO `/mural` avisa sobre alterações; clientes buscam só o delta, com fallback de 15 segundos enquanto visíveis. Não é transmitido cada movimento do pincel.

O PNG é carregado somente na página do mural. Rascunhos ficam no navegador; uma resposta perdida trava a edição até o mesmo envio ser confirmado, evitando duplicação. A borracha usa uma camada separada e nunca apaga desenhos de outros autores. No celular, selecione Mover para rolar; botões +/− controlam o zoom.

Limites da primeira versão: 100 traços / 2.000 pontos por publicação, espessura até 60, 15 segundos entre envios e 500 contribuições ativas. Ao atingir o limite, o muro informa que precisa de espaço. Não há limpeza automática nem imagem consolidada nesta versão; o cliente compõe as camadas, com carga paginada de 30 contribuições. Futuras edições do muro/snapshots podem ampliar essa capacidade.

## Validação

`node --test tests/mural.test.js` valida limites. Para integração em banco descartável use `TEST_DATABASE_URL` (nunca produção). Alternativamente `PGLITE_TEST_MODULE=/caminho/para/@electric-sql/pglite node --test tests/mural.test.js` executa a integração PostgreSQL embarcada. O adaptador PGlite serializa conexões por ser uma instância de conexão única; testar múltiplas conexões PostgreSQL continua recomendado no staging.

Verificados em PGlite: duas publicações em paralelo, persistência na recarga, idempotência, cooldown, acesso anônimo, permissão administrativa e remoção incremental. Sem acesso ao Neon de produção. O teste DOM do cliente passou para desenho, resposta perdida após salvar, retry imutável e limpeza do rascunho (`MURAL_HAPPY_DOM_MODULE=/caminho/happy-dom/lib/index.js node scripts/check-mural-client.mjs`, dependência somente para o teste). O teste visual Playwright foi bloqueado pelas restrições de sockets do Chromium neste ambiente.

A suíte existente apresenta uma falha anterior em `wardrobe-persistence.test.js`: variável `achievement` ausente no contexto mock do teste. O handler testado é idêntico à main.

Textura gerada para este recurso: muro frontal de concreto claro envelhecido, sem objetos, texto ou grafites prévios. Asset `public/mural-wall.png`, PNG com paleta otimizada.

## Arte do mascote

O cabeçalho reserva 220 × 200 px no desktop e 120 × 110 px no celular para o PNG do usuário, fora da superfície desenhável. Até chegar a arte, o selo Junto.fm ocupa esse espaço. Para aplicar: salvar em `public/images/mural-macaco.png`, definir esse `src` em `#muralMascot`, remover `hidden` da imagem e ocultar o selo dentro de `.mural-mascot`. `object-fit: contain` preserva a arte inteira e a transparência.
