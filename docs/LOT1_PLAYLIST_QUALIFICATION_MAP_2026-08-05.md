# Lote 1 — qualificação comercial de listas

Data do mapeamento: 2026-08-05

## Objetivo

Concluir a base comercial de cadastro, validação e ativação de listas sem depender de regras duplicadas em telas ou Edge Functions. A decisão sobre uma lista poder consumir crédito deve existir no banco e ser reutilizada por todos os fluxos.

## Escopo deste lote

- separar transporte técnico de qualificação comercial;
- impedir ativação ou renovação com lista ainda não comprovada;
- manter cadastro bem-sucedido mesmo quando a validação demora;
- distinguir cache pronto, teste direto pendente, erro recuperável e bloqueio definitivo;
- disponibilizar teste direto sem venda em aparelho explicitamente marcado para validação;
- promover uma lista direta somente após sucesso real reportado pelo aplicativo;
- centralizar mensagens e decisões em um contrato comum;
- preservar vínculos, prioridades, créditos e listas existentes;
- recuperar tentativas de cache interrompidas sem classificá-las como bloqueio definitivo;
- registrar auditoria sem URL, usuário, senha ou token.

## Fora do escopo

- catálogo persistente completo no Android, que pertence ao Lote 2;
- escolha Automático/Principal/Reserva pelo cliente, que pertence ao Lote 3;
- redução profunda da matriz e tratamento avançado de agregadores Sigma, que pertencem aos Lotes 4 e 5;
- exclusão de funções legadas ou listas duplicadas;
- alteração automática de vínculo ou prioridade.

## Mapa atual

### Cadastro

Existem três implementações de criação:

1. `admin-panel` — criação administrativa;
2. `seller-panel` — criação pelo vendedor;
3. `admin-inline-playlist` — criação durante ativação.

As três inserem diretamente em `panel_playlists` e aguardam `playlist-cache`. A interface ainda possui wrappers em `unified-playlist-entry.js` e `playlist-save-feedback-hotfix.js` para interpretar respostas diferentes.

### Cache

`playlist-cache` possui lease, heartbeat, manifestos imutáveis e preservação do cache anterior. O ciclo técnico é consistente, mas falhas de datacenter podem transformar a lista em `direct`, e `direct` hoje é tratado como utilizável antes de confirmação no aparelho.

### Ativação e renovação

Admin e vendedor consultam helpers distintos, mas ambos consideram utilizável:

- cache `ready`; ou
- modo `direct`.

Depois chamam `apply_device_subscription_complete_transaction`, que cobra crédito e ativa o aparelho atomicamente. A transação confirma somente que a lista existe, está ativa e pertence ao vendedor. Ela não confirma a qualificação comercial.

### Aplicativo

O Android já reporta sucesso e falha por lista. `device-config` grava a saúde do vínculo em `panel_device_playlists`, mas não promove a qualificação global da lista.

### Produção

O banco de produção não possui o domínio de laboratório presente em partes mais novas do repositório. O Lote 1 não dependerá desse domínio. Será criada uma sessão de validação pequena, independente e compatível com o esquema em produção.

## Dois estados separados

### Transporte técnico

Campo existente `playlist_access_mode`:

- `server_cache` — o aparelho recebe arquivos protegidos do cache;
- `direct` — o aparelho consulta a origem;
- `blocked` — não existe transporte permitido no momento.

Esse campo não autoriza venda.

### Qualificação comercial

Novo campo `playlist_qualification_status`:

- `validating` — cadastro concluído e validação em andamento;
- `ready_cache` — cache comprovado e pronto;
- `awaiting_device_test` — servidor não validou pelo datacenter e exige teste real no aparelho;
- `ready_direct` — acesso direto comprovado por aparelho autorizado;
- `retryable_error` — falha transitória ou infraestrutura interrompida; pode ser retestada;
- `blocked` — falha definitiva, origem inválida, credencial recusada ou política de segurança.

Somente `ready_cache` e `ready_direct` são comercialmente utilizáveis.

## Campos de qualificação

Em `panel_playlists`:

- `playlist_qualification_status`;
- `playlist_qualification_code`;
- `playlist_qualification_message`;
- `playlist_qualification_updated_at`;
- `playlist_qualified_at`;
- `playlist_direct_confirmed_at`;
- `playlist_direct_confirmed_device_id`.

Mensagens persistidas devem ser sanitizadas e limitadas. Nenhum campo novo armazena URL ou credencial.

## Fonte única de verdade

O banco fornecerá funções para:

- calcular a decisão comercial de uma lista;
- retornar rótulo e ação recomendada;
- promover cache concluído para `ready_cache`;
- classificar falha de cache;
- promover sucesso direto para `ready_direct`;
- invalidar a qualificação quando a origem for alterada;
- validar principal e reserva dentro da transação de ativação/renovação.

Admin, vendedor, edição e painel somente exibem esse contrato.

## Máquina de estados

### Nova lista ou origem alterada

`validating`

### Cache concluído

`validating` ou `retryable_error` ou `awaiting_device_test` -> `ready_cache`

### Falha elegível para acesso direto

`validating` -> `awaiting_device_test`

### Sucesso real no aparelho

`awaiting_device_test` ou `retryable_error` -> `ready_direct`

### Falha transitória

`validating` -> `retryable_error`

Exemplos: lease expirado, interrupção interna, timeout sem prova suficiente de bloqueio definitivo.

### Falha definitiva

`validating` -> `blocked`

Exemplos: credenciais inválidas, conta vencida, URL insegura, domínio inválido confirmado, resposta incompatível definitiva.

### Atualização de lista já homologada

Se nome ou metadado não sensível for alterado, a qualificação permanece. Se URL, credenciais ou tipo forem alterados, volta para `validating`, preservando o cache anterior somente para aparelhos já vinculados até a nova decisão.

## Validação direta sem venda

Nova tabela `panel_playlist_validation_sessions`:

- lista candidata;
- aparelho de validação;
- status `active`, `succeeded`, `failed`, `expired` ou `revoked`;
- início e expiração;
- erro sanitizado;
- usuário responsável;
- timestamps de sucesso/falha.

Novo campo em `panel_devices`:

- `is_playlist_validation_device`.

### Fluxo

1. Owner marca um aparelho próprio como aparelho de validação.
2. Owner inicia a sessão para uma lista `awaiting_device_test`.
3. `device-config` entrega somente a lista candidata ao aparelho, sem ativar cliente, sem alterar venda e sem criar vínculo comercial.
4. `device-config-direct` libera a origem somente para essa sessão e esse aparelho autenticado.
5. Android carrega normalmente e reporta sucesso ou falha.
6. Sucesso encerra a sessão e promove a lista para `ready_direct`.
7. Falha encerra ou mantém a lista pendente conforme o erro, sem consumir crédito.
8. Sessões expiram automaticamente e nunca alteram a saúde de clientes.

## Regra financeira

A função transacional que cobra crédito validará principal e reserva no mesmo bloqueio transacional.

Permitidos:

- `ready_cache`;
- `ready_direct`.

Negados:

- `validating`;
- `awaiting_device_test`;
- `retryable_error`;
- `blocked`.

Essa regra vale mesmo que uma tela antiga ou chamada direta tente ignorar o painel.

Ativações existentes não serão canceladas. A restrição vale para novas ativações e renovações que tentem aplicar uma lista não homologada.

## Migração conservadora

Backfill proposto:

- cache `ready` com itens -> `ready_cache`;
- `direct` com sucesso real registrado na matriz -> `ready_direct`;
- `direct` sem sucesso -> `awaiting_device_test`;
- erro transitório/lease -> `retryable_error`;
- erro definitivo -> `blocked`;
- restante -> `validating`.

O backfill não altera:

- `playlist_url`;
- vendedor;
- aparelho;
- prioridade;
- saldo;
- validade;
- vínculo principal/reserva.

## Contrato retornado ao painel

Cada lista deverá retornar:

- `accessMode`;
- `qualificationStatus`;
- `commerciallyUsable`;
- `qualificationLabel`;
- `qualificationMessage`;
- `recommendedAction`;
- `canRetryCache`;
- `requiresDeviceTest`;
- `qualifiedAt`;
- `directConfirmedAt`.

O frontend não deduz mais autorização a partir de `direct` ou `cacheStatus`.

## Criação canônica

Os três endpoints de criação usarão o mesmo serviço compartilhado para:

- validar e normalizar URL/tipo;
- calcular fingerprint sem expor segredo;
- evitar duplicidade da mesma origem para o mesmo escopo;
- inserir estado inicial `validating`;
- criar permissão do vendedor quando aplicável;
- iniciar cache;
- sempre retornar o ID salvo e o contrato de qualificação.

A validação demorada não transforma salvamento em falha. O usuário recebe o ID e acompanha o estado sem cadastrar novamente.

## Recuperação de cache

- lease expirado ou ausente -> `retryable_error`, nunca bloqueio definitivo por si só;
- cache anterior válido permanece `ready_cache` durante refresh;
- uma tentativa em andamento retorna a mesma operação;
- reteste é idempotente;
- somente a tentativa dona do lease publica ou falha;
- cron continua reconciliando tentativas abandonadas.

## Interface

Rótulos previstos:

- Validando lista;
- Cache pronto;
- Aguardando teste no aparelho;
- Acesso direto homologado;
- Falha temporária — tente novamente;
- Lista bloqueada.

Ações:

- Gerar cache novamente;
- Testar em aparelho de validação;
- Ver diagnóstico sanitizado;
- Editar origem.

Seletores de ativação exibirão somente listas comercialmente utilizáveis. Listas pendentes permanecem visíveis em “Minhas listas”, com a ação correta.

## Segurança

- URLs completas nunca entram em auditoria;
- usuário, senha, token e query string nunca entram em mensagem;
- origem direta só é entregue a aparelho autenticado e autorizado pela sessão;
- sessão possui expiração curta e vínculo exclusivo com aparelho/lista;
- seller não pode marcar aparelho de validação nem iniciar sessão global;
- todas as mudanças de qualificação são auditadas.

## Implantação

1. migration de campos, tabela, constraints, RPCs e backfill;
2. helpers compartilhados das Edge Functions;
3. integração do cache com a máquina de estados;
4. integração do sucesso/falha do aparelho;
5. sessão de validação no `device-config` e `device-config-direct`;
6. guarda financeira no banco;
7. refatoração de admin, seller, inline e edição;
8. contrato e UI;
9. testes unitários, pgTAP, Edge, navegador e Android;
10. PR em rascunho, CI completo e publicação somente após aprovação técnica.

## Critérios de aprovação

- cadastrar uma lista nunca cria duplicidade por timeout de interface;
- cache pronto autoriza ativação;
- acesso direto sem teste não autoriza crédito;
- sessão de validação não altera cliente, vínculo ou saldo;
- sucesso no aparelho promove a lista;
- falha no aparelho não cobra crédito;
- transação rejeita tentativa de contornar a interface;
- lease expirado aparece como erro recuperável;
- atualização de origem invalida a homologação anterior;
- todas as telas usam o mesmo estado;
- nenhum diagnóstico contém credencial;
- dados atuais permanecem vinculados exatamente como estavam.
