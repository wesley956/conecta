# Portal administrativo e portal do vendedor — v1.1

Esta publicação ativa o fluxo de provisionamento de vendedores por e-mail e senha.

- o administrador informa nome, WhatsApp, e-mail e senha inicial;
- a conta é criada no Supabase Auth;
- o usuário recebe o papel `seller` e é vinculado ao cadastro comercial;
- a senha não é armazenada em `panel_sellers`;
- o portal do vendedor utiliza autenticação JWT;
- falhas durante o provisionamento executam rollback da conta e do cadastro.

Publicação: 2026-07-16.
