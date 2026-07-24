# Cruz Stars Admin

Painel administrativo estático separado do APK para gerenciar clientes, listas, aparelhos, ativações e histórico de ações.

## Estrutura

- `index.html`: login único de administrador e vendedores.
- `dashboard.html`: dashboard administrativo.
- `seller.html`: portal do vendedor.
- `panel-config.example.js`: exemplo seguro da configuração pública.
- `assets/cruz-stars-logo.png`: logo transparente do Cruz Stars.
- `assets/universe-bg.png`: fundo visual do painel.

## Fluxo principal

1. O cliente instala o APK.
2. O APK gera um código de ativação.
3. O aparelho aparece como pendente no painel.
4. O administrador cadastra ou seleciona um cliente.
5. O administrador cadastra ou seleciona uma lista.
6. O administrador vincula cliente + lista ao aparelho.
7. O administrador libera o aparelho.
8. O APK recebe somente a lista vinculada àquele aparelho.

## Recursos atuais

- CRUD de clientes.
- CRUD de listas.
- Liberação, bloqueio e exclusão de aparelhos.
- Vínculo de cliente e até duas listas por aparelho.
- Portal do vendedor.
- Busca e filtros.
- Alertas de vencimento.
- Detalhes de cliente, lista e aparelho.
- Histórico e auditoria.
- Assinaturas e resultado de caixa confirmado.

## Deploy no Vercel

Importe o repositório pela raiz. O `vercel.json` do projeto executa o gerador e publica esta pasta automaticamente.

Cadastre no Vercel:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA-ANON
```

O build cria `panel-config.js`; esse arquivo não deve ser versionado. Use apenas a chave pública `anon` do Supabase. Nunca exponha `service_role`, senha de banco ou credenciais privadas no navegador.

## Observação

Este painel é separado do APK. O aplicativo oficial está em `native-android/`; rotas, telas e lógica administrativa permanecem somente neste painel.
