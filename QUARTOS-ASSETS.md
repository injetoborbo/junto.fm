# Fontes de modelos 3D para os Quartos

Critério: priorizar arquivos GLB, baixo peso/poligonagem e licença CC0 1.0 (dedicação ao domínio público). Não importar modelos apenas descritos como "free" sem conferir a licença do arquivo/pacote.

## 1. Free Apartment Props — Vuena / Popyca

- Repositório: https://github.com/Vuena/free-apartment-props-cc0
- Commit consultado: `41b06c6223d847d9de6519dd25a493d40e65992d`
- Licença: CC0 1.0; o README declara uso comercial, modificação e redistribuição sem atribuição. A licença cobre somente os 14 modelos desta amostra, não o kit completo vendido separadamente.
- Formato: 14 GLBs autocontidos com texturas PBR embutidas, além de FBX.
- Modelos úteis para o quarto: `ap_coffee_table`, `ap_dining_chair`, `ap_nightstand`, `ap_floor_lamp`, `ap_table_lamp`, `ap_plant_small`, `ap_plant_cactus`, `ap_vase`, `ap_book_stack`, `ap_pillow_square` e `ap_basket`.
- Limitação: não inclui sofá nem cama no sample gratuito. Não usar os arquivos do kit completo sob esta licença; a CC0 vale apenas para os 14 assets listados no repositório.

## 2. Kit Cidade Low Poly — kayquer

- Repositório: https://github.com/kayquer/kit-cidade-lowpoly
- Commit consultado: `ed5ba11d026ffc6c990035d117c7886b40ed3fb7`
- Licença: CC0 1.0, conforme README em português e arquivo LICENSE.
- Formato: 129 modelos GLB low-poly, cores chapadas, sem texturas, até 1.500 triângulos e 150 KB por modelo.
- Modelos úteis como decoração temática/urbana: `banco_praca`, `orelhao`, `poste_luz`, `vaso_planta`, `parquinho`, `ponto_onibus` e `lixeira`.
- Limitação: o pacote é mobiliário urbano, não mobiliário residencial; usar seletivamente como decoração temática, não como substituto de sofá/cama.

## Assets efetivamente ligados ao quarto nesta etapa

- Cadeira e mesa lounge: `public/club/cadeirabalada.glb` e `public/club/mesabalada.glb`, reaproveitados diretamente da Junto Club.
- Plantas, luminária, estante e caixa de som: `ap_plant_small.glb`, `ap_floor_lamp.glb`, `ap_nightstand.glb` e `ap_book_stack.glb`, servidos diretamente do commit CC0 fixado acima.
- Danças: os cinco GLBs já existentes em `public/dance/` são os mesmos clipes carregados pela Junto Club. A pose sentada reutiliza `public/poses/sentadobalanca.fbx`.

## Regras de integração

- Baixar somente os GLBs realmente usados; não carregar o pacote inteiro.
- Preferir assets locais em `public/models/quartos/` para evitar dependência de CDN de terceiros em tempo de execução.
- Manter este registro e a cópia da licença CC0 junto dos assets importados.
- Conferir escala, pivô, orientação, materiais e peso real antes de publicar.
- Não incorporar modelos de páginas agregadoras sem abrir a licença específica de cada asset.
