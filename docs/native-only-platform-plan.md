# Plano mestre — Plataforma nativa RonecaPlayTV

## Objetivo

Consolidar o produto em um único aplicativo Android nativo, compatível com celular, tablet, Android TV e TV Box, removendo o player e a compilação WebView/Capacitor. Em paralelo, evoluir o painel para assinaturas por cliente, listas exclusivas, múltiplos aparelhos, ferramentas de laboratório e segurança operacional.

## Princípios obrigatórios

- Um único APK nativo em `native-android/`.
- Nenhuma reprodução por WebView, `hls.js` ou `mpegts.js`.
- Controle remoto com um único roteador de teclas.
- Voltar fecha primeiro o contexto atual: menu, controles, player e então a tela de origem.
- Ao sair do player, categoria, filtro, rolagem e foco voltam exatamente ao estado anterior.
- Credenciais de listas não aparecem em logs nem na interface.
- Acesso de laboratório é temporário, auditado e limitado a dispositivos marcados como laboratório.
- Duração do laboratório é definida pelo proprietário no momento da sessão.
- Dinheiro e créditos continuam separados.

## Fase 1 — Núcleo nativo de TV

1. Substituir o comportamento implícito do `PlayerView` por um controlador explícito de teclas.
2. Tratar `DPAD_CENTER`, `ENTER`, `NUMPAD_ENTER`, `SPACE`, `MEDIA_PLAY_PAUSE`, `MEDIA_PLAY`, `MEDIA_PAUSE`, avanço e retrocesso.
3. Pausar imediatamente pelo botão físico de mídia, independentemente do foco.
4. Com controles escondidos, o primeiro OK mostra os controles e posiciona o foco no play/pause.
5. Restaurar o foco ao player depois de fechar canais, episódios ou cabeçalho.
6. Abrir menus laterais já focando o item atual.
7. Preservar categoria, pesquisa, filtros, rolagem horizontal, rolagem da grade e item focado em canais, filmes e séries.
8. Remover o patch dinâmico de controles do workflow e manter o código final diretamente no projeto nativo.

## Fase 2 — Nativo como única aplicação

1. Desativar a compilação Android Capacitor/WebView.
2. Remover o workflow de APK WebView.
3. Remover `android/`, configuração Capacitor e players React antigos.
4. Remover dependências `@capacitor/*`, `hls.js` e `mpegts.js` do produto.
5. Manter os painéis web estáticos e as ferramentas Node necessárias ao backend.
6. Tornar o workflow de `native-android/` a única fonte oficial de APK.

## Fase 3 — Segurança crítica

1. Proteger alterações de aparelho existente com credencial e ator autenticado.
2. Isolar clientes por vendedor e WhatsApp.
3. Fechar proxy por padrão e exigir autorização temporária.
4. Adicionar rate limiting, limites de corpo e limpeza de solicitações públicas.
5. Restringir CORS administrativo.
6. Remover mensagens internas de banco das respostas.
7. Tornar releases imutáveis e remover `--clobber`.
8. Adicionar CodeQL, dependências, segredos e análise de APK.

## Fase 4 — Assinaturas por cliente

Modelo principal:

```text
Cliente
└── Assinatura
    ├── Plano
    ├── Validade
    ├── Lista principal exclusiva
    ├── Lista reserva exclusiva
    └── 1 a 5 aparelhos autorizados
```

Regras:

- Planos mensal e trimestral com limites configuráveis de 1, 2, 3 ou 5 aparelhos.
- Limite de aparelhos cadastrados separado do limite de conexões simultâneas.
- Lista exclusiva por assinatura/cliente; nunca compartilhada com outro cliente.
- Adicionar aparelho dentro do limite não gera nova cobrança.
- Substituição revoga o aparelho antigo e não cobra novamente.
- Upgrade imediato com cobrança idempotente da diferença.
- Downgrade na próxima renovação.
- Snapshot dos valores do plano em cada assinatura.
- Migração dos dados antigos com conflitos marcados para revisão.

## Fase 5 — Modo Laboratório do proprietário

1. Papel exclusivo `owner`.
2. Dispositivos de teste marcados como `is_lab_device`.
3. Seleção da origem e do dispositivo de laboratório.
4. Duração informada pelo proprietário no momento da criação.
5. Motivo obrigatório.
6. Acesso temporário sem transferir propriedade, vendedor ou assinatura.
7. Credenciais nunca exibidas.
8. Auditoria completa, revogação manual e expiração automática.
9. Diagnóstico de cache sem reprodução: existência, idade, contagem, parser, amostra, regeneração e comparação.

## Fase 6 — Financeiro e operação

- Preservar o módulo financeiro já implantado.
- Relacionar movimentações futuras à assinatura sem misturar dinheiro e créditos.
- Manter o portal do vendedor sem comissão estimada.
- Exibir vencimentos, pendências, atrasos, aparelhos usados e vagas do plano.

## Critérios de aceite

- Pause responde em um único acionamento do botão físico.
- Nenhuma tecla importante depende do foco estar dentro do `PlayerView`.
- Retorno do player preserva categoria, rolagem e item focado.
- Apenas o APK nativo é compilado e publicado.
- Nenhum código de player WebView permanece como caminho de produção.
- Operações comerciais são transacionais e idempotentes.
- Uma lista ativa não pode ser atribuída a clientes diferentes.
- Sessão de laboratório expira na duração escolhida e não altera o cliente original.
