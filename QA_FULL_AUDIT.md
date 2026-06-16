# Auditoria Completa — RonecaPlayTV

## Status geral

| Área | Status |
|---|---|
| Build / Typecheck | ✅ Passou |
| Botões sem ação detectados automaticamente | ✅ Zerado |
| App do usuário | ✅ Revisado |
| Painel Admin | ✅ Revisado |
| CRUD visual do Admin | ✅ Botões ligados |
| Persistência real em backend | ⚠️ Ainda mock/local, não backend real |
| Player com URL real | ⚠️ Precisa teste manual com fonte autorizada |
| Importação M3U | ⚠️ Precisa teste manual com lista autorizada real |

---

## 1. App do usuário

### Ativação

| Função | Status esperado |
|---|---|
| Copiar código do dispositivo | Deve copiar e mostrar feedback |
| Solicitar acesso | Deve mudar estado da tela |
| Tentar novamente | Deve liberar simulação/demo e ir para Home |
| Enviar WhatsApp | Deve abrir link externo |
| Entrar em demonstração | Deve ir para Home |

### Home

| Função | Status esperado |
|---|---|
| Abrir TV ao vivo | Vai para Canais |
| Abrir Filmes | Vai para Filmes |
| Abrir Séries | Vai para Séries |
| Abrir Playback | Vai para Favoritos/Playback |
| Abrir Configurações | Vai para Configurações |
| Resumo de listas/canais/filmes/séries | Mostra contadores |

### Canais

| Função | Status esperado |
|---|---|
| Filtrar Buscar/Favoritos/Playback/Tudo A-Z | Atualiza lista |
| Filtrar categorias | Mostra canais da categoria |
| Selecionar canal | Destaca canal |
| Duplo clique/click de reprodução | Abre player |
| Logo ou fallback TV | Renderiza corretamente |

### Filmes

| Função | Status esperado |
|---|---|
| Trocar categoria | Atualiza grade |
| Abrir filme | Vai para Player |
| Barra de progresso | Aparece quando houver progresso |
| Grade limpa | Não estoura layout |

### Séries

| Função | Status esperado |
|---|---|
| Trocar categoria | Atualiza grade |
| Abrir série | Mantém fluxo de séries |
| Badge de temporadas | Mostra quantidade |
| Grade limpa | Não estoura layout |

### Playback/Favoritos

| Função | Status esperado |
|---|---|
| Abrir canal favorito | Vai para Player |
| Abrir filme em andamento | Vai para Player |
| Abrir série em andamento | Vai para Séries |
| Empty state | Aparece quando não há dados |

### Busca

| Função | Status esperado |
|---|---|
| Digitar busca | Filtra canais, filmes e séries |
| Abrir canal | Vai para Player |
| Abrir filme | Vai para Player |
| Abrir série | Vai para Séries |

### Listas

| Função | Status esperado |
|---|---|
| Adicionar URL M3U HTTPS | Importa canais se a fonte permitir |
| Colar conteúdo M3U manual | Importa canais |
| URL inválida | Mostra erro |
| HTTP em site HTTPS | Mostra erro de bloqueio |
| Cancelar | Fecha formulário |
| Ver listas existentes | Mostra contadores |

### Configurações

| Função | Status esperado |
|---|---|
| Alterar player preferencial | Atualiza estado |
| Alterar decodificação | Atualiza estado |
| Alterar buffer | Atualiza estado |
| Alterar idioma | Atualiza estado |
| Alternar TV/Mobile | Atualiza modo |
| Reconexão automática | Liga/desliga |
| P2P autorizado | Liga/desliga |

### Player

| Função | Status esperado |
|---|---|
| Carregar HLS .m3u8 | Reproduz com hls.js quando suportado |
| Fonte inválida | Mostra erro |
| Tentar novamente | Recarrega tela |
| Voltar | Retorna para Canais ou Filmes |
| Abrir lista lateral | Mostra canais |
| Trocar canal na lista | Atualiza player |

---

## 2. Painel Admin

### Dashboard

| Função | Status esperado |
|---|---|
| Cards de resumo | Mostram contadores |
| Dispositivo pendente: Liberar | Muda status para ativo |
| Dispositivo pendente: Rejeitar | Muda status para bloqueado |
| Alerta de pendentes | Atualiza conforme ações |

### Clientes

| Função | Status esperado |
|---|---|
| Buscar cliente | Filtra por nome/e-mail |
| Filtrar status | Ativo/vencido/bloqueado |
| Novo cliente | Abre formulário |
| Salvar cliente | Cria cliente no estado local |
| Ver cliente | Abre detalhe |
| Renovar cliente | Atualiza vencimento/status |
| Bloquear cliente | Muda status para bloqueado |
| Desbloquear cliente | Muda status para ativo |
| Editar cliente | Preenche formulário e salva alterações |
| Cancelar | Fecha formulário |

### Dispositivos

| Função | Status esperado |
|---|---|
| Buscar dispositivo | Filtra por código/cliente |
| Filtrar status | Ativo/bloqueado/pendente |
| Liberar pendente | Muda para ativo |
| Bloquear ativo | Muda para bloqueado |
| Desbloquear bloqueado | Muda para ativo |
| Contador de pendentes | Atualiza |

### Planos

| Função | Status esperado |
|---|---|
| Novo plano | Abre formulário |
| Salvar plano | Cria plano |
| Editar plano | Preenche formulário e salva |
| Ativar/desativar | Alterna status |
| Remover plano | Remove do estado local |
| Validação | Exige campos válidos |

### Listas Admin

| Função | Status esperado |
|---|---|
| Nova lista | Abre formulário |
| Adicionar M3U | Importa lista autorizada |
| Editar lista | Salva nome/tipo/url |
| Testar lista | Atualiza status/sync |
| Remover lista | Remove do estado local |
| Xtream/Stalker | Mostra aviso de fase futura |

### Avisos

| Função | Status esperado |
|---|---|
| Novo aviso | Abre formulário |
| Enviar aviso | Cria aviso |
| Ativar/desativar | Alterna status |
| Remover | Remove aviso |
| Validação | Exige título e mensagem |

### Logs

| Função | Status esperado |
|---|---|
| Filtrar logs | Filtra admin/sistema/cliente |
| Limpar logs | Zera lista |
| Empty state | Aparece após limpar |

---

## 3. Limitações atuais

O sistema ainda usa dados mock/local no front-end para várias ações administrativas. Isso significa:

- O CRUD funciona na interface.
- O estado muda na sessão atual.
- Ainda não existe persistência real em banco/backend para o painel.
- Ao recarregar a página, dados mock podem voltar.
- Para produção real, o próximo passo é conectar Admin CRUD em backend/Supabase/API.

---

## 4. Próxima fase recomendada

1. Persistência real do Admin.
2. Autenticação real de admin.
3. Banco de clientes/dispositivos/planos/listas.
4. Logs reais de auditoria.
5. Testes E2E com Playwright.
6. Build Android/TV Box.
