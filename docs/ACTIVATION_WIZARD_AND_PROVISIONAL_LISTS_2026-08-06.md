# Assistente de ativação e confirmação provisória de listas

## Fluxo comercial

- Listas com cache pronto ou acesso direto confirmado são liberadas normalmente.
- Listas ainda em validação podem ser usadas provisoriamente em Android/Android TV.
- O aplicativo confirma o funcionamento na primeira abertura.
- Listas bloqueadas ou inativas continuam impedidas.
- A homologação manual permanece como ferramenta administrativa de diagnóstico.

## Assistente do vendedor

A ativação é dividida em cinco etapas:

1. Cliente
2. Plano
3. Lista principal
4. Lista reserva opcional
5. Conferência

O cadastro universal pode ser aberto dentro da escolha da lista, sem retornar ao formulário antigo.

## Operações separadas

- **Ativar:** consome o crédito do plano e configura as listas em uma transação atômica.
- **Renovar:** atualiza plano e validade, preservando as listas atuais.
- **Alterar listas:** troca principal e reserva sem renovar validade e sem consumir crédito.

## Garantias

- Operações idempotentes.
- Validação de propriedade do aparelho e permissão das listas.
- Aparelhos de diagnóstico não entram no fluxo comercial.
- Nenhuma cobrança é confirmada se a configuração completa da ativação falhar.
- O gatilho de qualificação usa o tipo do aparelho durante a própria inserção, sem depender de uma consulta antecipada.

## Cobertura automatizada

A suíte verifica ativação provisória em Android, bloqueio de lista inválida, restrição de acesso direto em plataformas não compatíveis, renovação sem troca de lista e alteração de listas sem consumo de crédito.
