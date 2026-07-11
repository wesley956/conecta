# Auditoria-base do aplicativo RonecaPlayTV

Data de referência: 11/07/2026  
Branch de auditoria: `audit/tv-navigation-baseline`  
Base: `main`

## Objetivo

Registrar os problemas confirmados no aplicativo antes de qualquer mudança funcional. Este documento funciona como referência para comparar o comportamento anterior e posterior às melhorias.

## Regra de segurança

Nesta fase não serão alterados:

- player;
- navegação;
- telas do aplicativo;
- painel administrativo;
- painel do vendedor;
- backend;
- banco de dados;
- workflows de publicação.

## Problemas relatados e confirmados

### 1. Navegação geral por controle remoto

O aplicativo coleta elementos focáveis globalmente e escolhe o próximo pela proximidade geométrica. O algoritmo não conhece grupos lógicos como menu, categorias, grade, detalhes, episódios e recomendações.

Consequências possíveis:

- foco pula entre áreas diferentes;
- barra lateral recebe foco inesperadamente;
- cima e baixo não preservam a coluna visual;
- retorno de detalhes não restaura necessariamente o pôster anterior;
- componentes horizontais e grades competem pelo mesmo cálculo.

### 2. Navegação dentro do player

A navegação global é desativada no player. O player, o painel avançado e o aviso de próximo episódio registram controladores de teclado próprios.

Consequências possíveis:

- uma tecla pode ser interpretada pela camada errada;
- Enter pode pausar o vídeo em vez de acionar um botão;
- Voltar pode sair do player em vez de fechar uma camada;
- lista de canais, opções e controles não compartilham uma única regra de foco.

### 3. Legibilidade das categorias

Os nomes das categorias usam tipografia aproximada entre 0,68 rem e 0,70 rem. Os contadores usam aproximadamente 0,58 rem. Esses valores são pequenos para leitura à distância em televisão.

### 4. Continuar assistindo

Na página inicial, a seleção de um filme ou série em andamento define o conteúdo atual e abre a aba correspondente. A tela de destino controla os detalhes por estado local e não recebe uma intenção explícita para abrir detalhes ou retomar a reprodução.

Comportamento observado:

- filme em andamento abre a aba Filmes;
- série em andamento abre a aba Séries;
- o conteúdo correto não é aberto automaticamente.

### 5. Favoritos de séries

Há três problemas principais:

- o gesto da grade depende de eventos de ponteiro e não oferece suporte confiável ao D-pad;
- favoritos remotos podem permanecer marcados porque o estado antigo `isFavorite` é combinado com a lista atual usando uma operação lógica inclusiva;
- favoritos locais podem não provocar persistência completa do cache quando apenas uma propriedade interna muda.

### 6. Inicialização e recuperação do player

A abertura pode exibir mais de uma camada sequencial:

- preparação do player avançado;
- preparação da reprodução;
- tentativa de outra fonte;
- reconexão;
- controlador de estabilidade.

O player principal e o controlador de estabilidade também monitoram eventos semelhantes e possuem estratégias próprias de recuperação.

### 7. Compatibilidade de canais

Pontos que podem fazer uma fonte válida falhar:

- geração de variantes Xtream com heurística ampla;
- tentativa de `.m3u8` antes da URL `.ts` original em alguns casos;
- uso de `mpegts.js` dentro do WebView para fontes MPEG-TS;
- ausência de suporte a cabeçalhos especiais da playlist;
- ausência de interpretação de diretivas como `#EXTVLCOPT`;
- diferença de suporte de codecs entre WebView e motores Android nativos.

### 8. Interface do player

Existem duas áreas distintas de configuração:

- extensão no painel inferior;
- painel avançado lateral.

A lista de canais interna usa apenas os primeiros 36 canais disponíveis e não preserva a categoria de origem.

A barra de progresso possui apenas uma faixa simples. Para transmissões ao vivo, ela é exibida como preenchida, embora não represente progresso real.

## Problemas importantes da auditoria geral que permanecem registrados

Além dos itens visuais e de navegação, continuam registrados para fases futuras:

1. cobrança de créditos sem transação atômica completa;
2. troca de UUID de aparelho habilitada por padrão em certas condições;
3. ausência de limitação de requisições em endpoints públicos;
4. possível falha de persistência de favoritos;
5. consultas duplicadas no portal do vendedor;
6. falta de paginação nos painéis;
7. ausência de Error Boundary no aplicativo;
8. detecção de ambiente nativo duplicada;
9. `PlayerV2Screen` excessivamente grande;
10. painel administrativo monolítico.

## Ordem de trabalho aprovada

1. Criar referência de testes do comportamento atual.
2. Melhorar a navegação geral fora do player.
3. Unificar a navegação dentro do player.
4. Corrigir Continuar assistindo.
5. Corrigir favoritos de séries.
6. Criar diagnóstico de reprodução.
7. Melhorar seleção e compatibilidade de fontes.
8. Estudar protótipo Android Media3.
9. Unificar opções do player.
10. Redesenhar os controles e a barra de progresso.
11. Aumentar categorias no modo TV.

## Regras para futuras implementações

- Uma mudança por branch e por assunto.
- Nenhum merge sem teste em aparelho real.
- O painel administrativo e o painel do vendedor não fazem parte desta fase.
- Não reescrever o player inteiro de uma vez.
- Não mudar a URL original antes de ela ser testada, salvo regra comprovada.
- Nunca registrar credenciais completas de playlists em logs.
- Toda camada modal deve controlar e restaurar o foco.
- O botão Voltar deve fechar primeiro a camada mais interna.
- A interface deve manter apenas uma camada interativa ativa por vez.
