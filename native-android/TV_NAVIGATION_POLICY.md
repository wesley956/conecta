# Política de foco e D-pad — Android TV

Referência: Issues #272 e #273. Esta política vale para superfícies Compose do
app. O player continua sob `NativePlaybackKeyRouter` e controles Media3.

## Regras comuns

- feedback oficial: escala 1.035 em 75 ms, borda vermelha e sem deslocar layout;
- OK: `DirectionCenter`, `Enter`, `NumPadEnter` e `Spacebar` onde a ação é botão/card;
- ativação ocorre somente em `KeyDown`; `KeyUp` não dispara ação duplicada;
- TextField e player não têm setas consumidas por interceptador global;
- foco só é solicitado para elemento visível e habilitado;
- refresh mantém a identidade focada; se ela sumir, usa o primeiro item visível;
- estado de foco é contextual por tela, nunca global;
- Back fecha primeiro modal/drawer/detalhe/player e só depois volta à tela anterior.

## Contrato por superfície

| Superfície | Primeiro foco / restauração | Bordas e transições | OK / Back |
|---|---|---|---|
| Rail principal | destino atual; último destino ao voltar | busca geométrica vertical, sem wrap | abre destino; Back segue Activity |
| Home | primeiro card útil | hero, busca e atalhos permanecem grupos locais | abre destino/detalhe; Back padrão |
| Canais | último canal visível; primeiro se removido | busca → filtros rápidos/seletor → grid | canal abre player; Back player → canal |
| Filmes | último filme visível; primeiro se removido | busca → filtros rápidos/seletor → grid | abre detalhe; Back player → detalhe → grid |
| Séries | última série; temporada/episódio preservados | busca → filtros rápidos/seletor → grid | abre detalhe/episódio; Back retorna à origem |
| Busca | campo na entrada; resultado ao retornar | resultados com chaves estáveis | abre resultado; Back fecha resultado/tela |
| Minha Lista | mesma política de Filmes/Séries | filtro especial não altera identidade | abre item; Back restaura card |
| Configurações | primeira row habilitada | ordem vertical; row desabilitada não recebe foco | altera/abre diálogo; Back fecha diálogo |
| Ativação | ação disponível; código é apenas leitura | ações responsivas por form factor | atualiza/reset; Back padrão |
| Suporte futuro | ação focável; QR apenas visual | Back fecha modal antes de Settings | abre modal; Back fecha modal |
| Player/drawer | política própria Media3 | nenhum interceptador desta política | roteador nativo preservado |

## Exibição de categorias para TV

- `Configurações > Interface > Exibição das categorias` oferece `Clássica` e `Painel lateral`;
- `Clássica` é o padrão compatível e preserva a faixa horizontal do APK publicado;
- `Painel lateral` mantém as categorias fixas à esquerda e suporta 100+ opções;
- nesse modo, o rail principal fica totalmente recolhido enquanto o catálogo está aberto;
- a categoria atual usa check; o foco usa escala, borda vermelha de 3 dp e marcador lateral;
- `OK` aplica sem remover o painel e foca o primeiro item coerente do grid;
- `←` a partir das categorias revela o menu principal sobre a tela;
- `Back` em Canais, Filmes ou Séries também revela o menu principal;
- fechar o menu principal com `Back` devolve o foco à categoria atual;
- `→` a partir das categorias retorna ao último conteúdo coerente do catálogo;
- `←` na primeira coluna do catálogo retorna diretamente à categoria atual;
- se categoria desaparecer no refresh, fallback explícito para `Todos`;
- mobile preserva os chips horizontais touch atuais.

## Homologação física pendente

Validar os fluxos instrumentados da #272 em controle real, inclusive D-pad rápido,
OK repetido, refresh durante foco, item removido e seletor com 0/3/20/100+
categorias, alternância persistida entre os dois modos, menu principal recolhido,
saída por `←`/`Back` e retorno à categoria atual. Registrar diferenças de TV/TV
Box em relação ao CI.
