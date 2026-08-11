# RonecaPlayTV Android — Mapa Mestre de UX, Fluxos e Diagnóstico

> Documento vivo do cliente Android nativo. Baseline observada em 11/08/2026: RonecaPlayTV 2.9.5 (`versionCode 46`).
>
> Este documento registra o comportamento atual, decisões de produto em definição e os pontos de atenção encontrados na auditoria de UX/performance. Mudanças futuras relevantes devem ganhar Issue própria e referenciar a MASTER Android #266.

## 1. Objetivo

Manter em um único lugar o mapa funcional do APK Android para Android TV, Google TV, TV Box, celulares e tablets, incluindo:

- telas e responsabilidades;
- fluxos de navegação;
- comportamento TV × touch;
- foco/D-pad;
- responsividade e categorias;
- ativação e suporte responsável;
- carregamento de catálogo;
- riscos de concorrência/performance;
- player, recovery e failover.

## 2. Fluxo mestre

```text
ABRIR APK
  ↓
SPLASH / ASSINATURA DE MARCA
  ↓
BOOTSTRAP DO DISPOSITIVO
  ├─ sem sessão válida → ATIVAÇÃO
  └─ sessão válida → CONFIGURAÇÃO DO DISPOSITIVO
                         ↓
                    CARREGAR CATÁLOGO
                         ↓
HOME
  ├─ BUSCA
  ├─ CANAIS → PLAYER LIVE
  ├─ FILMES → DETALHE → PLAYER VOD
  ├─ SÉRIES → DETALHE → TEMPORADA → EPISÓDIO → PLAYER DE SÉRIE
  ├─ MINHA LISTA → favoritos / continuar assistindo
  └─ CONFIGURAÇÕES → player / rede / diagnóstico / suporte / update
```

## 3. Telas e responsabilidades

| Tela/área | Responsabilidade principal |
|---|---|
| Splash | identidade, assinatura sonora e transição de abertura |
| Ativação | identificar/liberar o aparelho e orientar o usuário |
| Home | portal do catálogo, destaques e atalhos |
| Busca | buscar canais, filmes e séries simultaneamente |
| Canais | live, busca, categorias, favoritos e A-Z |
| Filmes | catálogo VOD, busca, categorias, Minha Lista e Continuar |
| Detalhe do filme | metadados, favorito, recomendações e reprodução |
| Séries | catálogo, busca, categorias, Minha Lista e Continuar |
| Detalhe da série | temporadas, episódios, favorito, recomendações e retomada |
| Minha Lista | continuar assistindo + favoritos de canais, filmes e séries |
| Configurações | conteúdo, diagnóstico, decoder, buffer, aspecto, rede, interface, suporte e atualização |
| Player | Media3/ExoPlayer, D-pad, seek, aspecto, recovery e failover |
| Atualização | consulta, download, validação e instalação do APK |

## 4. Responsividade atual

A decisão estrutural atual do shell é majoritariamente baseada em:

```text
TV detectada
OU largura > altura
OU Modo TV forçado
```

- TV/layout largo: rail lateral, foco ampliado e componentes otimizados para D-pad.
- touch/layout compacto: barra inferior, layouts menores e interação por toque.
- TV física: orientação landscape forçada.

### Limitação identificada

Orientação não deve ser o único proxy de espaço disponível. Um telefone pequeno em landscape e um tablet/TV grande não deveriam necessariamente receber a mesma composição.

### Diretriz futura recomendada

Adotar classes de largura em telas críticas:

- Compact: `< 600dp`;
- Medium: `600–839dp`;
- Expanded: `>= 840dp`;

O objetivo não é reconstruir todo o app imediatamente, mas usar espaço disponível como critério quando a tela tiver conteúdo denso.

## 5. Tela de ativação — novo mapa de produto

### 5.1 Regra de suporte antes da ativação

Enquanto o código ainda não tiver vendedor responsável, o APK não deve tentar adivinhar um contato de vendedor.

Exibir apenas suporte oficial do sistema, configurado pelo ADM:

- nome oficial de suporte;
- QR Code de suporte;
- e-mail oficial;
- texto curto de ajuda;
- botão de suporte quando aplicável.

Mensagem principal sugerida:

> Envie este código ao seu fornecedor ou suporte.

### 5.2 Regra de suporte depois da ativação

Quando um vendedor assumir/ativar o código, o backend deve persistir o vínculo `device → seller`.

A partir desse vínculo, o app passa a usar o Perfil de Suporte do vendedor em `Configurações > Suporte`.

Perfil de suporte do vendedor:

- nome comercial;
- WhatsApp;
- e-mail opcional;
- texto de atendimento opcional;
- horário opcional;
- exibir contato no aplicativo: sim/não.

### 5.3 Hierarquia de fallback

```text
1. suporte do vendedor responsável
   ↓ se não existir/não estiver habilitado
2. suporte oficial do sistema
   ↓ se também não existir
3. mensagem genérica: "Envie este código ao seu fornecedor."
```

O backend deve preferencialmente devolver um `supportProfile` já resolvido para o APK, evitando lógica comercial complexa no cliente.

### 5.4 Composição da ativação por tamanho

#### TV / Expanded

Usar duas áreas lado a lado:

```text
┌─────────────────────────────────────────────────────────┐
│                    RONECA PLAYER TV                     │
│                  ATIVAR DISPOSITIVO                     │
│                                                         │
│  ┌─────────────────────┐  ┌──────────────────────────┐ │
│  │ CÓDIGO              │  │ PRECISA DE AJUDA?       │ │
│  │      AB12CD         │  │ Suporte oficial         │ │
│  │ Copiar / Enviar     │  │       QR CODE            │ │
│  └─────────────────────┘  │ e-mail / orientação      │ │
│                           └──────────────────────────┘ │
│                  [ ATUALIZAR ACESSO ]                  │
└─────────────────────────────────────────────────────────┘
```

O QR é prioritário na TV porque digitar telefone/URL com controle remoto é ruim.

#### Mobile / Compact

Usar coluna vertical:

```text
RONECA PLAYER TV
Ativar dispositivo

Código
AB12CD

[ Copiar código ]
[ Compartilhar código ]

Suporte oficial
E-mail / contato
[ Abrir suporte ]

[ Atualizar acesso ]
```

No celular, botão/deep link é prioritário; QR Code não deve ocupar grande área da própria tela.

### 5.5 Dívida atual da tela de ativação

A implementação atual é segura para o conteúdo existente porque limita largura e usa `verticalScroll` em touch, porém ficará verticalmente densa quando suporte/QR/e-mail forem adicionados. A inclusão do novo suporte deve vir acompanhada da nova composição responsiva, não simplesmente inserir novos blocos na coluna atual.

## 6. Configurações > Suporte — novo fluxo

Após o aparelho estar vinculado:

```text
CONFIGURAÇÕES
  ↓
SUPORTE
  ↓
Responsável pelo dispositivo
Nome comercial
WhatsApp
E-mail opcional
Horário opcional
[ Falar com suporte ]
```

- TV: ação abre QR Code grande/modal de contato.
- mobile: ação abre deep link do WhatsApp/canal configurado.
- Play Store: linguagem deve ser de suporte/ajuda/responsável, sem transformar a tela em mecanismo explícito de pagamento externo.

## 7. Home

Responsabilidades atuais:

- cabeçalho e Busca;
- estado do aparelho;
- hero de destaque;
- filme/série secundários;
- atalhos TV ao vivo, Filmes, Séries e Minha Lista;
- status do carregamento do catálogo.

O hero rotaciona destaques periodicamente. Em layout largo a Home usa melhor o espaço horizontal; no compacto vira uma composição vertical.

## 8. Busca

Busca simultaneamente canais, filmes e séries.

Fluxos:

- canal → Player;
- filme → Detalhe → Player;
- série → Detalhe → Episódio → Player.

Há estados de busca vazia e sem resultados.

## 9. Canais e categorias

Recursos atuais:

- busca;
- Todos;
- Favoritos;
- A-Z;
- categorias oriundas de `groupTitle`;
- TV em grade de 3 colunas;
- mobile em lista vertical;
- restauração do último item focado.

### Diagnóstico do layout de categorias

Hoje as categorias são exibidas em uma `LazyRow` horizontal de chips. Funciona bem com poucas categorias e em touch, mas tem uma limitação de UX em TV quando a lista é longa:

- exige muitas pressões laterais;
- categorias distantes ficam invisíveis até rolar;
- usuário pode perder contexto de onde está;
- alternar entre busca → categorias → grade aumenta percurso de D-pad.

### Recomendação

Para TV, estudar um seletor de categoria mais eficiente:

1. manter chips rápidos para `Todos`, `Favoritos`, `A-Z`;
2. agrupar as demais categorias em painel/drawer ou seletor expansível focável;
3. preservar a categoria selecionada e o último foco por categoria;
4. evitar centenas de chips numa única faixa horizontal.

No mobile, a `LazyRow` continua aceitável.

## 10. Filmes e Séries

- TV: 6 posters por linha.
- mobile: 2 posters por linha.
- poster 2:3.
- busca + categorias.
- Minha Lista e Continuar.
- restauração de foco na TV.

### Diagnóstico de foco

Pontos positivos atuais:

- `onFocusChanged` por card;
- borda/superfície de foco consistente;
- escala única de foco (`1.035`, animação de 75 ms);
- restauração do último item focado em Canais/Filmes/Séries;
- Enter/OK/NumPad Enter/Space tratados em várias superfícies.

Pontos de atenção:

- nem todas as superfícies usam exatamente o mesmo roteamento de teclas;
- chips, cards, resultados e player têm implementações locais de key handling;
- telas densas com categorias horizontais + grids verticais dependem muito do algoritmo padrão de foco do Compose;
- uma alteração visual pequena pode mudar geometria e fazer o foco saltar para um vizinho inesperado.

### Recomendação

Evoluir para uma política explícita de foco por tela:

- definir primeiro foco;
- definir retorno do player/detalhe;
- preservar último foco por seção/categoria;
- validar esquerda/direita/cima/baixo nas bordas da grade;
- criar testes instrumentados de navegação D-pad para caminhos críticos;
- manter escala curta (75 ms) e evitar animações mais pesadas em TV Box low-RAM.

## 11. Minha Lista

Centraliza:

- continuar filmes;
- continuar séries;
- canais favoritos;
- filmes favoritos;
- séries favoritas.

Favorito e progresso são estados independentes.

## 12. Player e recuperação

Parâmetros importantes observados:

- seek: ±10 s;
- startup timeout: 20 s;
- live stall: 12 s;
- VOD stall: 25 s;
- salvar progresso: a cada 10 s;
- validação de reprodução saudável: 8 s;
- retry transitório: 2 / 4 / 8 s;
- fallback hardware → software em falha de decoder compatível;
- múltiplas origens antes da lista reserva;
- preservação de posição VOD.

Aspecto oficial:

- Original;
- Preencher;
- Estender.

## 13. Diagnóstico — por que o conteúdo pode demorar mesmo após ativação

### Comportamento atual

A identidade e a credencial do dispositivo são persistidas. Portanto, um aparelho já ativado não precisa gerar um novo código.

Entretanto, em um novo processo do aplicativo:

1. `DeviceSessionRepository.bootstrap()` lê código/credencial;
2. consulta novamente a configuração protegida do dispositivo;
3. o `CatalogViewModel` começa com `NativeCatalogState()` vazio;
4. carrega lista/origens novamente;
5. em Xtream direto pode mostrar canais primeiro e hidratar filmes/séries depois;
6. em caminho de compatibilidade canais/filmes/séries são consultados em paralelo.

### Veredito

A ativação está persistida, mas o catálogo visível não tem hoje uma restauração imediata de um snapshot local completo no `CatalogViewModel`. Isso produz uma experiência de "aparelho conhecido, catálogo ainda carregando".

### O que eu recomendo

Criar uma estratégia **stale-while-revalidate** para catálogo:

```text
abrir app
  ↓
validar sessão rapidamente
  ↓
mostrar último snapshot local válido imediatamente
  ↓
consultar backend/provedor em segundo plano
  ↓
substituir snapshot apenas quando houver nova versão válida
```

Requisitos de segurança/consistência:

- snapshot deve ser privado ao app;
- nunca persistir segredos desnecessários;
- associar snapshot ao playlist/device correto;
- TTL/versionamento;
- invalidar ao trocar lista, desvincular dispositivo ou receber configuração incompatível;
- não permitir que snapshot antigo contorne status bloqueado/expirado: primeiro validar direito de acesso ou usar janela curta controlada.

Benefício esperado: Home e catálogo aparecem muito mais rápido em reaberturas sem eliminar a atualização em segundo plano.

## 14. Diagnóstico — risco de travamento enquanto consulta APIs

### O que está correto hoje

- chamadas de cache/HTTP pesado usam `Dispatchers.IO`;
- cliente Xtream direto usa `withContext(Dispatchers.IO)`;
- carregamento de canais/filmes/séries pode usar coroutines concorrentes;
- hidratação progressiva pode ser cancelada/suspensa durante playback em TV;
- dispositivo low-RAM é detectado;
- a Activity possui monitoramento de jank/memória.

Não foi encontrado, nesta auditoria, um caminho evidente em que a consulta HTTP principal esteja sendo executada diretamente na UI thread.

### Onde ainda existe risco de engasgo/jank

O risco é mais indireto:

- listas muito grandes sendo parseadas/alocadas;
- atualização de grandes `StateFlow` com milhares de itens;
- recomposição de UI quando catálogo muda;
- carregamento simultâneo de muitas imagens;
- usuário navegando por D-pad enquanto hidratação atualiza filmes/séries;
- TV Box com pouca RAM sofrendo GC frequente;
- múltiplas tentativas de origem/protocolo durante provedor lento;
- mudanças de coleção que invalidem grids enquanto o foco está ativo.

### Recomendação

- manter parsing/rede fora da main thread;
- introduzir snapshot local para reduzir trabalho crítico de startup;
- fazer atualizações de catálogo por seção e com identidade estável;
- evitar substituir coleções inteiras sem necessidade;
- limitar/paginar/hidratar imagens de forma progressiva;
- preservar foco durante atualização de dados;
- instrumentar métricas de startup: tempo até Home, primeiro canal, filmes, séries e first-frame navegável;
- testar em hardware low-RAM durante refresh manual e automático;
- bloquear apenas a ação que exige exclusividade, nunca a navegação inteira, quando uma atualização estiver em andamento.

## 15. Classificação da auditoria atual

### Foco/D-pad

**Estado: bom, mas ainda dependente demais de regras locais.**

A base visual e restauração de foco estão maduras. O próximo ganho é centralizar política e testar bordas/transições sistematicamente.

### Categorias

**Estado: funcional, porém não ideal para catálogos com muitas categorias em TV.**

A faixa horizontal é adequada para mobile e razoável em TV pequena, mas não escala bem para dezenas/centenas de categorias.

### Startup após ativação

**Estado: funcional, com oportunidade clara de ganho perceptível.**

Persistir um snapshot seguro e usar stale-while-revalidate é a melhoria de maior impacto percebido para reabertura.

### API enquanto o usuário navega

**Estado: arquitetura assíncrona correta, porém ainda sujeita a jank por volume de dados/memória/recomposição.**

Não há evidência de HTTP principal bloqueando a UI; o risco deve ser tratado como concorrência/volume e não simplesmente "tirar API da main thread".

## 16. Próximas decisões antes de abrir Issues

Ainda não transformar automaticamente estes pontos em Issues. Primeiro fechar especificação de produto para:

- novo Perfil de Suporte ADM/Vendedor;
- contrato `supportProfile` no backend;
- layout responsivo final da ativação;
- Configurações > Suporte;
- padrão de categorias para TV;
- estratégia de snapshot local/stale-while-revalidate;
- matriz de teste D-pad e low-RAM.

Depois disso, abrir Issues filhas referenciando #266, cada uma com comportamento atual, comportamento esperado, risco, aceite e evidência de teste.
