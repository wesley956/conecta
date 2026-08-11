# RonecaPlayTV — Painel Web ADM/Vendedor

Painel web oficial da RonecaPlayTV para administração do ecossistema, operação de vendedores, clientes, listas, aparelhos, créditos, financeiro, releases e diagnóstico.

> **Baseline oficial:** [Issue #267 — MASTER PAINEL](https://github.com/wesley956/conecta/issues/267)
>
> Este README descreve a arquitetura e os contratos atuais. Mudanças relevantes em permissões, fluxo comercial, listas, aparelhos, financeiro, releases, segurança ou backend devem ganhar Issue própria e referenciar a MASTER.

## Visão geral

O painel é um componente separado dos aplicativos Android, LG webOS e Samsung Tizen, mas compartilha com eles contratos de ativação, listas, aparelhos, releases e permissões.

Superfícies principais:

- **Administrador** — gestão global e operações administrativas;
- **Vendedor** — operação comercial limitada ao próprio escopo e permissões.

Backend principal:

- Supabase Auth;
- Supabase Edge Functions;
- PostgreSQL/Supabase Database;
- Storage privado para artefatos de release.

Deploy web: fluxo integrado ao Vercel.

## Estrutura principal

Arquivos e módulos centrais ficam em `admin-panel/`.

Entre as áreas atuais estão:

- `index.html` — login único do painel;
- `dashboard.html` / `dashboard.js` — superfície administrativa;
- `seller.html` e módulos `seller-*` — portal e fluxos do vendedor;
- `panel-auth-session.js` — sessão Supabase Auth do navegador;
- `admin-device-flow.js` — operações administrativas de aparelhos;
- `mobile-more-navigation.js` — controlador compartilhado do menu **Mais** e navegação compacta;
- `finance-module.js` — financeiro privado do vendedor;
- `credit-packages-module.js` — pacotes e pedidos de créditos;
- `app-release.js` — consulta e download de releases publicados;
- `playback-diagnostics-module.js` — diagnóstico autorizado de reprodução;
- módulos de operações ADM, privacidade comercial, listas, lifecycle/qualificação e redesign.

A lista de arquivos pode crescer com o produto; a MASTER #267 e os gates automatizados são referências mais fortes que nomes históricos isolados.

## Autenticação e autorização

O painel atual utiliza **Supabase Auth**.

Papéis oficiais:

- `owner`;
- `admin`;
- `seller`.

A autorização é validada no backend através de `panel_user_roles` e das Edge Functions, não apenas por ocultação visual de botões.

Regras importantes:

- seller precisa estar vinculado a um vendedor válido;
- vendedor precisa estar ativo, não excluído e dentro do período de acesso;
- owner/admin não devem carregar vínculo comercial de seller indevido;
- sessão expirada passa por refresh controlado;
- tokens administrativos legados não fazem parte do fluxo moderno;
- JWT e `anon key` do painel não devem ser enviados para destinos externos arbitrários.

## Administrador

A superfície ADM cobre, conforme permissão e módulo:

- dashboard e indicadores;
- clientes;
- vendedores;
- listas;
- aparelhos;
- ativações e operações administrativas;
- histórico e auditoria;
- operações comerciais;
- créditos/pacotes;
- assinaturas e financeiro de empresa quando aplicável;
- releases/downloads de aplicativos;
- diagnóstico operacional/playback autorizado.

## Portal do vendedor

O vendedor possui experiência própria, separada da interface administrativa.

O portal inclui:

- visão operacional do dia;
- clientes dentro do escopo comercial;
- aparelhos;
- ativação;
- renovação;
- troca de listas;
- listas permitidas ao seller;
- créditos/pacotes;
- financeiro privado do vendedor;
- navegação responsiva/mobile.

As permissões do seller são reforçadas pelo backend e não devem ser ampliadas somente por mudanças de frontend.

## Clientes

O ecossistema atual possui CRUD/consulta de clientes, busca, filtros e detalhes.

Clientes participam do fluxo de ativação e operação comercial de aparelhos. Dados comerciais devem respeitar o papel autenticado e os módulos de privacidade/auditoria.

## Vendedores e acesso temporário

O painel possui provisionamento e gerenciamento de vendedores.

O backend considera:

- status ativo/inativo;
- exclusão lógica/estado válido;
- vínculo entre usuário autenticado e seller;
- expiração de acesso temporário;
- preservação de histórico comercial/financeiro quando aplicável.

## Listas e fontes

O painel atual vai além de um CRUD simples.

O ecossistema de listas inclui:

- cadastro e edição;
- fluxos M3U/Xtream e fontes universais;
- múltiplos endpoints/origens quando suportados;
- validação de fonte;
- qualificação comercial;
- lifecycle de listas;
- cache e manifest;
- resiliência de cache;
- gerenciamento de origens;
- fluxo inline de cadastro/ativação;
- operação de listas pelo vendedor dentro das permissões.

As listas podem ser consumidas pelos apps conforme o contrato entregue pelo backend.

## Lista principal + reserva

O modelo de banco suporta **até duas listas por aparelho**, com prioridades:

- `1` — principal;
- `2` — reserva.

A relação é mantida em `panel_device_playlists`.

Regras estruturais:

- um aparelho possui no máximo uma lista por prioridade;
- a mesma lista não pode ocupar as duas posições do mesmo aparelho;
- o backend mantém compatibilidade com o campo primário legado de `panel_devices`;
- a relação pode guardar estado de saúde, falhas e cooldown para continuidade/failover.

Mudanças nesse contrato devem ser tratadas como integração **painel ↔ backend ↔ apps**.

## Aparelhos e ativação

O painel participa do ciclo completo de dispositivos:

1. o app gera/usa sua identidade e código de ativação;
2. o aparelho aparece no ecossistema do painel;
3. cliente e configuração comercial são associados;
4. lista principal e, opcionalmente, reserva são definidas;
5. o aparelho é ativado/liberado;
6. o app consulta a configuração autorizada.

Também existem operações de renovação, bloqueio, troca de listas e desvínculo conforme o papel e o fluxo correspondente.

## Fluxo comercial canônico de aparelhos

A Edge Function `seller-device-flow` centraliza as operações comerciais principais:

- `activate`;
- `renew`;
- `changePlaylists`.

Regras importantes:

- ativação aceita lista principal e reserva;
- reserva deve ser diferente da principal;
- renovação preserva cliente e listas;
- troca de listas não altera cliente, plano ou validade;
- operações usam chave de idempotência para impedir reaplicação/cobrança duplicada.

O frontend deve reutilizar esse fluxo em vez de criar caminhos paralelos de cobrança/ativação.

## Créditos e financeiro

O painel possui módulos específicos para créditos e financeiro.

### Créditos

O ecossistema inclui:

- pacotes de créditos;
- pedidos de compra;
- lotes/saldo;
- operações administrativas autorizadas;
- RPCs transacionais para atualização de pagamento e liberação de créditos.

Operações críticas devem permanecer atômicas e idempotentes.

### Financeiro do vendedor

O financeiro privado do seller é separado da lógica de ativação do aparelho.

Ele pode registrar/consultar operações dentro do próprio escopo, mas **não deve ativar, renovar ou trocar listas diretamente**. Essas ações pertencem ao fluxo canônico de aparelhos.

A API específica do financeiro privado deve permanecer restrita ao seller correspondente.

## Navegação mobile e menu Mais

Mobile é parte suportada do produto.

O controlador compartilhado `mobile-more-navigation.js` coordena a navegação compacta de ADM e Vendedor.

Baseline atual:

- breakpoint compacto: **820 px**;
- destinos principais do seller preservados: `home`, `activation`, `devices`, `lists`;
- áreas secundárias podem ser agrupadas no **Mais**;
- submenu deve respeitar safe area e altura útil do viewport;
- ADM e vendedor compartilham o mesmo controlador de comportamento compacto;
- formulários/wizards comerciais devem continuar utilizáveis em telas pequenas.

Há gate automatizado específico para evitar regressão dessa navegação.

## Releases e downloads

O painel usa o contrato `app_releases` para distribuição de versões publicadas.

Plataformas suportadas pelo contrato atual:

- `android`;
- `webos`;
- `tizen`.

Regras:

- bucket de artefatos é privado;
- download exige autorização válida;
- links são assinados e temporários;
- TTL atual do link autorizado: **1 hora**;
- distribuição normal considera somente registros `published=true`;
- Android, LG e Samsung mantêm artefatos separados;
- webOS diferencia Candidate/RC de promoção explícita para Stable.

Uma build técnica não deve ser apresentada automaticamente como Stable.

## Diagnóstico e segurança

O painel possui módulos e contratos de diagnóstico, incluindo playback.

Regras de segurança:

- `SUPABASE_ANON_KEY` é configuração pública permitida para o cliente web;
- `service_role`, senha do banco e segredos privados nunca devem entrar no bundle do navegador;
- operações privilegiadas ficam em Edge Functions/backend;
- diagnóstico deve sanitizar URLs, credenciais, tokens e outros campos sensíveis;
- autorização ADM/vendedor deve ser validada no servidor;
- URLs externas arbitrárias não devem receber automaticamente a sessão do painel.

## Identidade visual

A identidade visual atual acompanha o ecossistema RonecaPlayTV:

- linguagem grafite/vermelha;
- identidade oficial compartilhada com Android;
- Roneca branco / Player dourado / TV vermelho onde a assinatura completa é exibida;
- ADM e Vendedor possuem layouts próprios, porém sem criar marcas paralelas independentes.

Evite restaurar wordmarks rasterizados antigos como fontes independentes da identidade oficial.

## Backend e Edge Functions

Funções importantes do ecossistema incluem, entre outras:

- `admin-panel`;
- `seller-panel`;
- `seller-device-flow`;
- `finance-panel`;
- `credit-packages-panel`;
- `seller-commercial-panel`;
- `admin-operations-panel`;
- `admin-integrity-panel`;
- `app-release`;
- `playback-diagnostics-panel`;
- `playback-diagnostics-report`;
- `device-activate`;
- `device-config`;
- `device-unlink`;
- `playlist-cache`;
- `playlist-registration`;
- `playlist-validation`;
- gerenciamento/qualificação/probe/report de listas e provedores.

A existência de uma função no repositório deve continuar coerente com migrations, contratos e deploy de produção.

## Configuração e deploy web

O build do painel gera `panel-config.js` a partir das variáveis públicas permitidas.

Exemplo:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA-ANON
```

Nunca colocar no frontend:

```text
SUPABASE_SERVICE_ROLE_KEY
senha de banco
segredos de assinatura
credenciais privadas de provedores
```

O repositório possui fluxo de deploy para Vercel. **Estado funcional do código e estado operacional do último deployment são dimensões diferentes**: limites externos de build/deploy não devem ser interpretados automaticamente como defeito lógico do painel.

## Validação e CI

O `npm run verify` da raiz possui gates específicos para várias partes do painel e do ecossistema, incluindo:

- migrations;
- parser/fontes M3U e Xtream;
- segurança de fetch externo;
- cache e manifest de listas;
- qualificação/lifecycle;
- autenticação;
- seller e acesso temporário;
- failover;
- fluxo inline de listas;
- financeiro e créditos;
- assinaturas;
- releases;
- segurança comercial;
- operações ADM;
- diagnóstico;
- responsividade;
- runtime graph do painel;
- identidade/premium;
- integração Android e Smart TV.

O CI também executa Browser E2E para Admin, Seller e superfícies Smart TV relevantes.

## Áreas de alto risco

Mudanças nestas áreas exigem regressão dirigida:

1. Supabase Auth / refresh;
2. papéis owner/admin/seller;
3. provisionamento, bloqueio e expiração do seller;
4. ativação/renovação/troca de listas;
5. principal/reserva/failover;
6. CRUD, qualificação e lifecycle de listas;
7. créditos, pedidos, financeiro e RPCs atômicas;
8. operações destrutivas e auditoria;
9. releases/Stable/download assinado;
10. configuração pública Supabase/Vercel;
11. navegação mobile/Mais/formulários pequenos;
12. diagnóstico e sanitização;
13. contratos compartilhados com Android/LG/Samsung;
14. migrations/schema/Edge Functions.

## Regra de evolução

Não reconstruir retrospectivamente uma Issue para cada microajuste já encerrado.

Abrir Issue própria para:

- bug ADM/Vendedor;
- autenticação/permissão;
- cliente/lista/aparelho;
- financeiro/créditos;
- operação comercial;
- UX/mobile;
- release/download;
- Supabase/API/schema;
- segurança/auditoria;
- diagnóstico;
- performance/refatoração estrutural.

Toda Issue filha deve registrar comportamento atual, comportamento esperado, impacto em mobile/desktop, impacto em backend/apps, riscos, critérios de aceite, evidência de teste e PR/deploy relacionado.
