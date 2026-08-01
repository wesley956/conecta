# Inventário do painel publicado — 01/08/2026

## Resultado

O painel publicado agora possui um grafo verificável de recursos. Cada JavaScript e CSS no diretório principal precisa ser alcançável por uma página HTML, pelo gerador seguro de configuração ou por uma dependência explícita de outro módulo publicado.

| Entrada | Núcleo direto | Módulos carregados pela configuração |
|---|---|---|
| dashboard.html | autenticação, dashboard.js, base visual e distribuição do app | provisionamento, ativação com lista, finanças, pacotes de crédito, edição de listas, comercial v2, privacidade v2, operações e diagnóstico |
| seller.html | autenticação, portal responsivo, listas e distribuição do app | ativação com lista, finanças, pacotes de crédito, edição de listas, comercial v2, navegação v2 e diagnóstico |
| index.html | autenticação e base visual | nenhum módulo operacional |
| lg-review.html | autenticação isolada e catálogo de homologação | nenhum módulo comercial |

## Camadas aposentadas

- commercial-consolidation.js, admin-commercial-privacy.js e seller-dynamic-navigation.js: versões v1 substituídas e sem referência de execução.
- panel-ux.js: fallback duplicado que não era carregado; a validade temporária passou para o núcleo real do dashboard.
- panel-next-ux.css: conteúdo incorporado à base visual com alvos de 44×44 px e sem seus 47 usos de !important.
- subscription-module.js e subscription-module.css: protótipo visual não publicado e dependente do domínio de assinaturas ausente na produção. O backend e os testes transacionais permanecem preservados.

## Proteções

O comando npm run check:panel-runtime-graph falha quando:

- um recurso publicado não existe;
- um JavaScript ou CSS do diretório principal não é alcançável pelo painel;
- uma camada aposentada reaparece;
- a lógica volta a ser embutida no HTML monolítico;
- os contratos globais do dashboard deixam de existir;
- a camada consolidada reintroduz !important ou reduz os alvos administrativos abaixo de 44 px.
