# Auditoria de código — painéis administrador e vendedor

Branch: `audit-admin-seller-cleanup`

## Problemas confirmados

- Portal do vendedor dividido entre HTML inline e dois scripts que inseriam componentes e substituíam funções após o carregamento.
- Inicialização repetida por `DOMContentLoaded` e temporizadores de 250/350 ms.
- Helpers, cliente de API, filtros e renderização duplicados.
- Segundo portal de vendedor em `public/vendedor.html`, fora do deploy oficial do GitHub Pages.
- Script `admin-panel/panel-ux.js` não importado por nenhuma página.
- Três scripts de patch que já haviam alterado o HTML e poderiam reaplicar mudanças antigas.
- Entrada única com CSS, JavaScript e eventos inline.
- Deploy dos painéis sem validação estrutural própria.

## Limpeza aplicada

- Portal oficial consolidado em `seller.html`, `seller.css` e `seller.js`.
- Entrada consolidada em `index.html`, `access.css` e `access.js`.
- Portal antigo preservado apenas como redirecionamento compatível.
- Scripts e estilos legados comprovadamente órfãos removidos.
- Script `check-panels.mjs` adicionado para verificar HTML, JavaScript, CSS e referências.
- `npm run verify` agora inclui a auditoria dos painéis.
- Deploy do GitHub Pages valida os painéis antes de publicar.
- Pull requests dos painéis recebem validação automática completa.

## Dashboard administrativo

O dashboard continua funcionalmente preservado nesta etapa. Ele ainda é um arquivo monolítico grande, portanto a auditoria automática reporta:

- IDs duplicados;
- referências estáticas a elementos inexistentes;
- ações HTML sem função declarada;
- declarações de função duplicadas;
- possíveis funções nunca chamadas;
- crescimento acima do limite de revisão.

A extração física do CSS e JavaScript do dashboard deve ocorrer somente depois desta versão passar pelos testes funcionais, para evitar uma reescrita ampla sem checkpoint.

## Critérios de aprovação

- `npm run check:panels` sem falhas;
- `npm run verify` sem falhas;
- login administrativo e do vendedor;
- CRUD e filtros administrativos;
- consulta, vínculo, ativação, renovação e bloqueio pelo vendedor;
- criação e atualização de cache das listas;
- deploy de teste do GitHub Pages.
