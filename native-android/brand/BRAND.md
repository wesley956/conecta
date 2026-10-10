# Sistema vetorial Roneca Player TV

Esta pasta é a fonte oficial da marca usada pelo Android, Android TV e materiais de distribuição.

## Arquivos mestres

- `ronecaplaytv-symbol.svg`: símbolo colorido, transparente e escalável.
- `ronecaplaytv-wordmark.svg`: assinatura horizontal. O texto deve ser convertido em caminhos antes da publicação dos derivados.
- `ronecaplaytv-symbol-mono.svg`: versão monocromática para fundos ou impressões sem cor.
- `ronecaplaytv-app-icon.svg`: ícone mestre sobre grafite, com margem segura para launchers.
- `ronecaplaytv-lockup-horizontal.svg`: composição horizontal para telas de ativação e materiais.
- `ronecaplaytv-tv-banner.svg`: banner mestre 16:9 da Android TV.

## Paleta do produto

- fundo: `#080809`
- superfície: `#131315`
- superfície elevada: `#19191C`
- borda: `#2B2B30`
- vermelho principal: `#E3262E`
- vermelho de foco: `#FF454C`
- vermelho profundo: `#80151A`
- texto principal: `#F7F7F8`
- texto secundário: `#9C9CA5`

O dourado pertence à marca, não à interface. Botões, seleção, progresso e foco usam a família vermelha do painel.

## Área de proteção

Reserve ao redor do símbolo uma margem mínima equivalente a 10% da sua largura. Não estique, incline, recolora parcialmente nem aplique fundo incorporado ao arquivo mestre.

## Derivados

Os PNGs em `app/src/main/res/drawable-nodpi` e o banner de TV são renderizados destes SVGs. Não devem ser editados manualmente.

## Exceção: ícone do webOS/LG

`ic_app.png` é um ícone **adaptativo** (cantos arredondados, fundo em gradiente,
transparência fora do tile) pensado para launchers que aplicam sua própria máscara,
como o Android. A LG Seller Lounge rejeitou o IPK em 2026-09-18 (QA2026091823049/
50/51) porque o webOS não aplica máscara nenhuma: exige ícone quadrado, 100% opaco
e com fundo em cor sólida única igual à `backgroundColor` do `appinfo.json`.

Por isso o pacote webOS (`smart-tv/scripts/stage-platform.mjs` e
`stage-webos-hosted.mjs`) usa um master dedicado em
`smart-tv/platforms/webos/app-icon-source.png` — mesmo emblema, mas em canvas
1024x1024 quadrado, totalmente opaco e com fundo `#080809` sólido (sem gradiente).
`smart-tv/scripts/check-lg-branding.mjs` (gate LG-02) valida isso automaticamente:
falha o build se algum ícone webOS gerado tiver transparência ou cor de canto
diferente da `backgroundColor` declarada.
