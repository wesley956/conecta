# Painéis administrativos RonecaPlayTV

Painéis estáticos separados do APK para administrar clientes, vendedores, listas, aparelhos, ativações, créditos e histórico.

## Entradas oficiais

- `index.html`: autenticação única para administrador e vendedor.
- `dashboard.html`: painel do administrador.
- `seller.html`: portal oficial do vendedor.

## Organização

- `pro-panel.css`: identidade visual compartilhada.
- `panel-ux.css` e `panel-next-ux.css`: estilos específicos do dashboard administrativo.
- `seller.css`: estilos exclusivos do portal do vendedor.
- `seller.js`: autenticação, consulta, ativação, renovação, bloqueio, filtros, listas e extrato do vendedor.
- `assets/`: imagens utilizadas pelos painéis.

O portal do vendedor não usa mais scripts que alteram a página depois do carregamento. Toda a marcação está em `seller.html` e toda a lógica está em `seller.js`.

## Fluxo principal

1. O cliente instala o APK e recebe um código de ativação.
2. O aparelho aparece como pendente.
3. O administrador ou vendedor autorizado localiza o código.
4. Cliente, plano e lista são vinculados ao aparelho.
5. A ativação ou renovação consome os créditos configurados.
6. O APK recebe somente a lista autorizada para aquele aparelho.

## Recursos atuais

- CRUD de clientes, vendedores, planos e listas.
- Controle de créditos e extrato por vendedor.
- Liberação, renovação, bloqueio e exclusão de aparelhos.
- Vínculo de cliente, plano e lista por aparelho.
- Busca, filtros e alertas de vencimento.
- Detalhes e histórico de auditoria.
- Geração e acompanhamento de cache das listas.

## Validação

Execute:

```bash
npm run check:panels
```

A verificação procura referências quebradas, IDs duplicados, JavaScript inválido, CSS desbalanceado e o retorno acidental de arquivos legados.

## Publicação

O workflow `.github/workflows/deploy-admin-panel.yml` valida e publica somente a pasta `admin-panel` no GitHub Pages.

O código do aplicativo em `src/` não deve conter rotas, telas ou lógica administrativa.
