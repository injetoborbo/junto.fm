# Retratos para o placar TSE temporário

Envie as duas artes em PNG com fundo transparente (preferencialmente mesmo tamanho e proporção).

- `public/election-2026/flavio.png` — sprite de Flávio Bolsonaro
- `public/election-2026/lula.png` — sprite de Lula

A interface já referencia esses nomes, posiciona cada imagem **ao lado do nome** e anima a cabeça com leve oscilação e flutuação, inspirada no movimento de sprites de personagens de Hotline Miami. A animação é a mesma para ambos, com tempos defasados para não parecerem sincronizados.

Antes dos PNGs existirem, aparecem somente as iniciais **F** e **L** no lugar das imagens. Evite colocar outro formato com extensão .png.

Para instalar localmente, coloque o PNG no caminho correspondente dentro do projeto e atualize a página. Para publicar no GitHub, faça commit desses dois arquivos binários na branch temporária usando o VS Code.
```powershell
git add public/election-2026/flavio.png public/election-2026/lula.png
git commit -m "Adiciona retratos PNG ao placar temporario"
git push origin feature/temporary-lula-flavio-poll-20261026
```

As imagens e a interface pertencem ao PR temporário #38, removíveis depois da apuração.
