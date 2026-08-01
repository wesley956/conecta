# Arquitetura visual — Cruz Stars e Roneca Player TV

## Papéis da marca

- **Cruz Stars** é a empresa e identifica os ambientes operacionais: acesso único, painel administrativo e portal do vendedor.
- **Roneca Player TV** é o produto de entretenimento e identifica os aplicativos Android TV, LG webOS e Samsung Tizen.
- A forma curta **Roneca** pode aparecer em espaços reduzidos depois que o nome completo já estiver visível. Não usar `RonecaPlayTV`, `ronecaPlayer TV` ou capitalização integral como nome apresentado ao usuário.

## Cores e significado

- **Vermelho (`#ff3b30`)**: foco de navegação, ação principal operacional e alertas. Ações destrutivas precisam também de texto/ícone e confirmação; nunca dependem apenas da cor.
- **Dourado (`#e8c768`)**: identidade do produto, conteúdo selecionado e destaques editoriais. Seleção e foco são estados diferentes: dourado indica seleção; vermelho indica onde o controle remoto está.
- **Texto principal (`#f7f4ec`)**: títulos e informação essencial.
- **Texto secundário (`#a39d91`)**: metadados e instruções. Deve manter contraste mínimo de 4,5:1 nos fundos principais.
- **Texto desabilitado (`#69645b`)**: somente conteúdo indisponível e não essencial.

## Interação

- Controles web e mobile têm no mínimo `44 × 44 px`.
- Controles de TV têm no mínimo `48 dp` e foco perceptível por borda, escala e contraste, não apenas por cor.
- Cada contexto apresenta uma única ação primária preenchida.
- Ações destrutivas ficam separadas das ações frequentes e sempre pedem confirmação contextual.

## Tipografia e linguagem

- Rótulos de navegação vistos à distância usam no mínimo `11 sp` na TV.
- Metadados essenciais usam contraste AA; texto abaixo desse contraste é reservado a estados desabilitados.
- Usar frases diretas em português do Brasil e capitalização normal: “Roneca Player TV”, “Cruz Stars”, “TV ao vivo”.

## Aplicação por superfície

| Superfície | Marca visível | Cor de identidade | Foco/interação |
|---|---|---|---|
| Acesso, administrador e vendedor | Cruz Stars | vermelho e cinza | anel vermelho |
| Android TV | Roneca Player TV | dourado e vermelho | anel vermelho, escala discreta |
| LG webOS e Samsung Tizen | Roneca Player TV | dourado e vermelho | anel vermelho, escala discreta |

Esta arquitetura é a referência do Lote 7. Mudanças de nome, token ou estado de foco devem atualizar o verificador de fundamentos e passar pela regressão visual.
