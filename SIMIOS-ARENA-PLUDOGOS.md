# The Símios — Arena dos Macacos e Pludogos (MVP)

Primeira implementação isolada em uma branch de feature. Não altera a Junto.TV,
o placar de votos, roupas, banana verde, bebidas ou as animações existentes.

## Arena dos Macacos

- Entrar na mesma sala e abrir **The Símios** nos dois navegadores.
- Abrir **🥊 Arena dos Macacos**, selecionar um adversário que está na pista e
  enviar um desafio. O adversário precisa clicar **Aceitar** em até 20 segundos.
- Apenas uma luta por sala, com dois participantes e espectadores.
- Por turnos; cada macaco tem 100 de vida e 75 de energia inicialmente.
- **Soco**: 16 de dano, custo 12 de energia (recupera 5 após o golpe).
- **Golpe forte**: 28 de dano, custo 30 de energia (recupera 5).
- **Defesa**: recupera 28 de energia e reduz o próximo golpe recebido a
  aproximadamente 40% do dano.
- 9 de energia recuperados pelo outro jogador quando alguém age.
- A partida termina ao zerar a vida, quando um jogador sai ou após 90 segundos
  sem ação. A luta é voluntária e não altera o estado da dança.
- A vida, energia, turno, participantes e golpes são calculados no servidor,
  nunca aceitos a partir de valores enviados pelo navegador.

## Pludogos

- Abrir **🐾 Meus Pludogos** dentro da The Símios.
- Escolher Caramelo, Noturno, Rosinha ou Nenhum.
- Criaturas 3D low-poly feitas com geometria Three.js: sem modelos extras.
- O Pludogo acompanha seu macaco e é visível para todos na pista.
- A preferência é salva no `localStorage` **do navegador**, reaplicada ao
  entrar novamente na pista; ainda não há inventário/coleção sincronizados por
  conta no banco de dados.

## Testar

```powershell
git fetch origin
git switch feature/simios-arena-pludogos-20261110
git pull --ff-only
node --test tests/simios-games.test.js
npm.cmd start
```

Abra `http://localhost:3000` em dois navegadores/sessões diferentes, entre na
mesma sala, entre na pista, equipe pets distintos, desafie, aceite e alterne
golpes. Teste saída/recusa, entrada de um terceiro espectador, mobile e temas
(Kodoku, Windows XP etc.).

**Limitações desta versão:** a arena é uma interface de luta por turnos com
ícones de macaco e efeitos de golpe; não há ainda animação corporal de socos nos
rigs GLB nem arena física separada. Os Pludogos são modelos procedurais
temporários, não artes finais personalizadas. Sem recompensas de vitória,
negociação de pets ou pontuação persistente.
