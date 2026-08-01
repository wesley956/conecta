# Diagnóstico de layout, UI e UX — 2026-08-01

## Resultado executivo

A base visual está estável e não precisa ser refeita do zero. O painel, o portal e o aplicativo de TV compartilham uma direção escura consistente, os estados de aparelho são compreensíveis e o foco por controle remoto está visível.

O Lote 7 deve concentrar a intervenção em cinco frentes:

1. corrigir acessibilidade e legibilidade;
2. tornar as ações principais inequívocas;
3. reduzir densidade e risco no celular;
4. padronizar foco, marca e tokens entre Android, LG e Samsung;
5. consolidar as camadas antigas de CSS e JavaScript antes de ampliar o painel.

Nenhuma mudança deste diagnóstico foi aplicada à produção.

## Escopo e método

Foram auditadas as seguintes superfícies:

- acesso único do painel em desktop e celular;
- dashboard administrativo, aparelhos e comercial;
- início e aparelhos do portal do vendedor;
- ativação, início e catálogo do Smart TV em 1920×1080 e 1280×720;
- componentes e tokens do Android TV por inspeção do código Compose;
- estrutura de CSS/JavaScript do painel e portal.

A auditoria visual usou o build real do Smart TV e os HTML/CSS/JavaScript reais do painel. Os dados e respostas de rede foram simulados localmente; todas as chamadas externas foram bloqueadas. Foram produzidos dez cenários visuais com dados representativos, sem acessar clientes nem alterar o Supabase.

Verificações automáticas executadas:

- conteúdo significativo e ausência de tela em branco;
- ausência de overlay de erro;
- overflow horizontal nos viewports auditados;
- nomes acessíveis de campos;
- dimensões dos controles;
- contraste WCAG AA com axe-core;
- estado de foco do controle remoto;
- erros de JavaScript e falhas de recursos.

O arquivo `$WEBAPIS/webapis/webapis.js` aparece ausente somente na pré-visualização por arquivo local. Esse script é fornecido pela plataforma Samsung e não representa regressão do aplicativo.

## O que já funciona bem

- Nenhum dos dez cenários ficou em branco ou apresentou overlay de erro.
- Não houve overflow horizontal em 390, 1280, 1440 ou 1920 px.
- Login, filtros principais e campos do portal possuem rótulos acessíveis.
- O foco do Smart TV combina contorno, sombra e escala de `1.035`, permanecendo perceptível em 1280×720 e 1920×1080.
- Cards de aparelhos usam cores de estado e agrupamento consistentes.
- O dashboard administrativo prioriza pendências e vencimentos de forma clara.
- A adaptação de tabelas de aparelhos para cards no celular já evita rolagem lateral.

## Achados priorizados

| ID | Prioridade | Superfície | Achado e evidência | Correção proposta para o Lote 7 |
|---|---|---|---|---|
| UX-01 | P0 | Login | `Entrar` e `Limpar acesso salvo` aparecem com o mesmo peso visual. O CSS final neutraliza o botão principal. | Dar a `Entrar` estilo primário preenchido e manter limpeza como ação secundária discreta. No celular, permitir empilhamento quando necessário. |
| UX-02 | P0 | Comercial do administrador | A auditoria encontrou 10 inputs sem rótulo acessível e 4 selects sem nome acessível. Visualmente, nome, WhatsApp, saldo, status e “permitir negativo” dependem apenas do cabeçalho da tabela. | Associar `label`, `aria-label` ou `aria-labelledby` a todos os 14 controles; manter o cabeçalho como contexto visual. |
| UX-03 | P0 | Painel e portal no celular | Botões e navegação medem em geral 33–36 px de altura. Isso reduz a área de toque e aumenta erros operacionais. | Adotar mínimo de 44 px para controles web/mobile, com espaçamento de pelo menos 8 px entre ações de risco. |
| UX-04 | P0 | Smart TV e Android TV | O contraste automático falhou em 1 texto da ativação, 2 textos da home e 11 ocorrências do catálogo de exemplo. No Android, `TextMuted` (`#69645B`) sobre os fundos principais fica entre 3,24:1 e 3,47:1. | Elevar o token de texto discreto até pelo menos 4,5:1 para texto normal; reservar contraste menor apenas a itens realmente desabilitados e não essenciais. |
| UX-05 | P0 | Smart TV | Os cards “Explorar” concatenam rótulo e contagem (`TV ao vivo12 canais`, `Filmes10 títulos`). Placeholders dos destaques exibem um `R` quase invisível. | Separar rótulo e contagem com layout/gap explícito e criar placeholder de mídia com contraste e proporção padronizados. |
| UX-06 | P1 | Android, LG e Samsung | O foco não usa o mesmo token: cards Android alternam borda branca, dourada ou vermelha; Smart TV usa anel vermelho. Na navegação Android, o rótulo focado usa apenas 8 sp. | Criar um componente/token único de foco: borda forte, halo, escala e texto legível; manter diferença clara entre “selecionado” e “focado”. Aumentar rótulos de navegação e metadados vistos à distância. |
| UX-07 | P1 | Portal do vendedor no celular | Cada aparelho mostra até cinco ações com peso semelhante. `Abrir`, `Renovar`, `Ativar`, `Bloquear` e `Excluir` competem no mesmo bloco, elevando risco de toque acidental. | Exibir uma ação principal e mover operações secundárias para “Mais ações”. Manter bloqueio/exclusão em área destrutiva com confirmação contextual. |
| UX-08 | P1 | Administrador no celular | Cabeçalho e oito opções de navegação ocupam grande parte da primeira dobra. Os cards são corretos, mas o usuário demora a chegar ao conteúdo. | Usar navegação compacta e persistente com quatro destinos principais e menu “Mais”; reduzir repetição de marca/cabeçalho. |
| UX-09 | P1 | Portal do vendedor em desktop | A home usa apenas a faixa superior para oito métricas e deixa a maior parte da tela vazia, sem orientar a próxima ação. | Acrescentar “Ações de hoje”: ativações pendentes, vencimentos próximos, saldo baixo e atalhos para ativar/renovar, sem duplicar todas as tabelas. |
| UX-10 | P1 | Smart TV home | Em 1920×1080, a home termina após o bloco Explorar quando não há histórico ou favoritos. Há grande área vazia e baixa descoberta de catálogo. | Incluir uma linha derivada do catálogo, como “Filmes para explorar” ou “Adicionados recentemente”, preservando histórico/favoritos quando existirem. |
| UX-11 | P1 | Marca e linguagem | A mesma jornada alterna “Cruz Stars”, “RonecaPlayTV”, “ronecaPlayer TV” e “RONECAPLAYTV”. A paleta administrativa é vermelho/cinza e a experiência de entretenimento é dourado/vermelho sem uma regra documentada. | Definir arquitetura de marca: empresa/portal e produto/player, com nomes, logotipos, capitalização, tipografia e papel das cores documentados em tokens. |
| UX-12 | P1 | Código do painel | O painel acumula 16 arquivos CSS, 22 arquivos JavaScript e 547 usos de `!important`. `dashboard.html` possui 122.690 bytes e recebe cinco folhas de estilo em cascata. Isso explica variações de altura, checkbox e precedência visual. | Consolidar somente os módulos realmente carregados, eliminar camadas antigas e transformar tokens/controles em uma base única antes de novas telas. |
| UX-13 | P2 | Comercial | O checkbox “Permitir negativo” aparece como um quadrado branco grande, separado do texto “PERMITIR”, e destoa dos demais controles. | Criar switch/checkbox rotulado com estado explícito e descrição do impacto financeiro. |
| UX-14 | P2 | Cards de aparelho | Datas exibem segundos, telefones aparecem sem máscara e UUIDs técnicos ocupam o mesmo nível de informações operacionais. | Formatar WhatsApp e datas, remover segundos e deixar identificadores técnicos dentro de detalhes/diagnóstico. |
| UX-15 | P2 | Feedback | O toast “Painel atualizado” pode cobrir filtros e parte dos cards no celular. | Posicionar feedback em área segura, não bloqueante, e reservar alertas persistentes somente para falhas acionáveis. |
| UX-16 | P2 | TV e Android | Títulos longos truncam cedo nos cards e metadados usam 8–11 sp em alguns componentes Android. | Definir limites de duas linhas onde houver altura e uma escala tipográfica mínima por distância/viewport. |

## Ordem recomendada do Lote 7

### 7A — Fundamentos visuais e acessibilidade

- criar tokens compartilhados de cor, tipografia, espaçamento, raio, foco e estados;
- corrigir UX-01 a UX-06;
- adicionar verificador automático para rótulos, contraste, foco e dimensões mínimas;
- documentar a arquitetura Cruz Stars × Roneca Player TV.

### 7B — Painel administrativo e portal responsivo

- compactar navegação mobile;
- reorganizar ações de aparelho;
- melhorar a home do vendedor;
- transformar comercial em componentes rotulados e responsivos;
- padronizar datas, telefone, toasts e ações destrutivas.

### 7C — Experiência de TV

- corrigir espaçamento dos cards Explorar e placeholders;
- elevar contraste e tipografia secundária;
- unificar foco no Android, LG e Samsung;
- preencher a home sem histórico com conteúdo útil;
- revisar safe area e legibilidade em 1280×720 e 1920×1080.

### 7D — Consolidação do código antigo

- inventariar quais módulos v1/v2 ainda são carregados;
- retirar CSS/JavaScript morto somente após teste de equivalência;
- reduzir `!important` e centralizar componentes;
- dividir o HTML monolítico do dashboard em módulos testáveis sem mudar contratos do backend.

### 7E — Testes completos

- navegador real: login, administrador, vendedor, filtros, ativação, renovação, listas principal/reserva, créditos e exclusão;
- TV: navegação integral por setas/OK/voltar, foco sempre visível e retorno ao item anterior;
- Android: screenshots/instrumentação em 720p e 1080p;
- LG/Samsung: build, empacotamento e smoke test de foco;
- regressão visual nos viewports definidos abaixo.

## Critérios de aceite do Lote 7

- zero violação crítica de nome/rótulo nos fluxos auditados;
- contraste mínimo de 4,5:1 para texto normal e 3:1 para texto grande;
- controles web/mobile com pelo menos 44×44 px;
- alvos principais de TV com pelo menos 48 dp e foco perceptível sem depender apenas de cor;
- nenhum overflow horizontal em 320, 390, 768 e 1440 px;
- layout íntegro em 1280×720 e 1920×1080;
- no máximo uma ação primária preenchida por contexto;
- ações destrutivas separadas e confirmadas;
- navegação por controle remoto sem foco perdido ou preso;
- `npm run verify`, Android, LG, Samsung, Edge Functions, migrations/pgTAP e Vercel verdes;
- testes de navegador cobrindo administrador e vendedor antes da mesclagem.

## Limites desta auditoria

- Não foram usados dados reais nem credenciais de usuários.
- O Android foi avaliado por código e pelos checks/builds existentes; a validação visual em emulador/aparelho entra em 7E.
- O diagnóstico não autoriza ignorar o backup obrigatório antes da ativação do banco em produção.
