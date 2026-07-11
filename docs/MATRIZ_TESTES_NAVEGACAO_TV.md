# Matriz de testes — navegação por controle remoto

Data: 11/07/2026  
Aplicativo: RonecaPlayTV  
Objetivo: registrar o comportamento atual antes de mudar a navegação.

## Como preencher

Para cada caso, registrar:

- **Resultado atual:** para onde o foco realmente foi;
- **Visual:** se o foco permaneceu claramente visível;
- **Rolagem:** se a tela acompanhou o elemento focado;
- **Problema:** salto, travamento, ação dupla, foco perdido ou comportamento inesperado;
- **Aparelho:** marca/modelo da TV ou TV Box;
- **Controle:** modelo ou tipo do controle;
- **Versão:** APK testado.

Use estas classificações:

- `OK` — comportamento previsível;
- `CONFUSO` — funciona, mas o destino não é intuitivo;
- `FALHA` — foco some, trava ou executa ação errada;
- `NÃO TESTADO`.

---

## Regras desejadas para todas as telas

1. Deve existir apenas um foco visível.
2. O foco não pode desaparecer após atualização do conteúdo.
3. Cima/baixo devem preservar a coluna quando possível.
4. Esquerda/direita devem permanecer na linha ou área atual.
5. A barra lateral só deve receber foco por uma transição intencional.
6. Ao voltar de detalhes, o foco deve retornar ao item de origem.
7. O item focado deve permanecer totalmente visível.
8. Enter deve executar apenas a ação do item focado.
9. Voltar deve fechar primeiro a camada local e só depois mudar de tela.
10. Nenhuma tecla pode produzir duas ações.

---

# A. Página inicial

| ID | Posição inicial | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| HOME-01 | Página recém-aberta | — | Foco no primeiro conteúdo útil, não obrigatoriamente no menu |  | NÃO TESTADO |
| HOME-02 | Primeiro item da linha Continuar | Direita | Próximo item da mesma linha |  | NÃO TESTADO |
| HOME-03 | Item intermediário da linha | Esquerda | Item anterior da mesma linha |  | NÃO TESTADO |
| HOME-04 | Item da linha Continuar | Baixo | Item da linha imediatamente inferior, coluna semelhante |  | NÃO TESTADO |
| HOME-05 | Item da linha inferior | Cima | Voltar à linha superior, coluna semelhante |  | NÃO TESTADO |
| HOME-06 | Primeiro item de uma linha | Esquerda | Entrar no menu somente de forma previsível |  | NÃO TESTADO |
| HOME-07 | Item em Continuar | Enter | Retomar o conteúdo correto | Atualmente abre apenas a aba correspondente | FALHA CONHECIDA |
| HOME-08 | Qualquer item | Voltar | Ir ao destino anterior ou permanecer na raiz conforme regra |  | NÃO TESTADO |

---

# B. TV ao vivo

| ID | Posição inicial | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| LIVE-01 | Tela recém-aberta | — | Foco na categoria selecionada ou canal selecionado |  | NÃO TESTADO |
| LIVE-02 | Categoria | Direita | Próxima categoria |  | NÃO TESTADO |
| LIVE-03 | Categoria | Esquerda | Categoria anterior |  | NÃO TESTADO |
| LIVE-04 | Categoria | Baixo | Entrar no canal selecionado ou primeiro canal da categoria |  | NÃO TESTADO |
| LIVE-05 | Canal da grade | Direita | Próximo canal da mesma linha |  | NÃO TESTADO |
| LIVE-06 | Canal da grade | Baixo | Canal da próxima linha mantendo coluna |  | NÃO TESTADO |
| LIVE-07 | Canal da grade | Cima | Linha anterior ou categorias quando estiver na primeira linha |  | NÃO TESTADO |
| LIVE-08 | Canal | Enter | Selecionar/abrir comportamento previsto sem ação dupla |  | NÃO TESTADO |
| LIVE-09 | Botão Assistir agora | Enter | Abrir player do canal selecionado |  | NÃO TESTADO |
| LIVE-10 | Após sair do player | — | Restaurar canal e categoria anteriores |  | NÃO TESTADO |

---

# C. Filmes

| ID | Posição inicial | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| MOV-01 | Tela recém-aberta | — | Foco na categoria selecionada ou primeiro filme |  | NÃO TESTADO |
| MOV-02 | Categoria | Direita/Esquerda | Navegar apenas entre categorias |  | NÃO TESTADO |
| MOV-03 | Categoria | Baixo | Primeiro pôster da categoria |  | NÃO TESTADO |
| MOV-04 | Pôster | Direita/Esquerda | Pôster adjacente na linha |  | NÃO TESTADO |
| MOV-05 | Pôster | Cima/Baixo | Pôster da linha vizinha mantendo coluna |  | NÃO TESTADO |
| MOV-06 | Pôster | Enter | Abrir detalhes do filme |  | NÃO TESTADO |
| MOV-07 | Detalhes | Voltar | Voltar à grade no mesmo pôster |  | NÃO TESTADO |
| MOV-08 | Botão Continuar assistindo | Enter | Abrir player e restaurar posição |  | NÃO TESTADO |
| MOV-09 | Último item visível | Baixo | Carregar/mostrar próximos itens sem perder foco |  | NÃO TESTADO |

---

# D. Séries

| ID | Posição inicial | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| SER-01 | Tela recém-aberta | — | Foco na categoria selecionada ou primeira série |  | NÃO TESTADO |
| SER-02 | Categoria | Direita/Esquerda | Navegar apenas entre categorias |  | NÃO TESTADO |
| SER-03 | Categoria | Baixo | Primeiro pôster da categoria |  | NÃO TESTADO |
| SER-04 | Pôster | Enter | Abrir detalhes da série |  | NÃO TESTADO |
| SER-05 | Pôster | Segurar Enter | Favoritar/desfavoritar de forma confiável | Implementação atual depende de eventos de ponteiro | FALHA CONHECIDA |
| SER-06 | Detalhes | Direita/Esquerda | Navegar pelas ações principais |  | NÃO TESTADO |
| SER-07 | Temporadas | Direita/Esquerda | Trocar temporada |  | NÃO TESTADO |
| SER-08 | Episódios | Cima/Baixo | Navegar pela lista de episódios |  | NÃO TESTADO |
| SER-09 | Episódio | Enter | Abrir episódio correto |  | NÃO TESTADO |
| SER-10 | Detalhes | Voltar | Voltar ao pôster de origem |  | NÃO TESTADO |
| SER-11 | Série em Continuar | Enter | Retomar último episódio incompleto | Atualmente abre apenas a aba Séries | FALHA CONHECIDA |
| SER-12 | Botão Minha Lista | Enter | Alternar favorito e refletir em todas as telas |  | NÃO TESTADO |

---

# E. Minha Lista

| ID | Posição inicial | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| LIST-01 | Filme em andamento | Enter | Retomar filme diretamente | O componente local abre o player; confirmar em TV | NÃO TESTADO |
| LIST-02 | Série em andamento | Enter | Abrir detalhes ou retomar último episódio conforme decisão final | Atualmente abre detalhes da série | NÃO TESTADO |
| LIST-03 | Canal favorito | Enter | Abrir player do canal |  | NÃO TESTADO |
| LIST-04 | Filme favorito | Enter | Abrir detalhes ou player conforme seção | Atualmente abre player | NÃO TESTADO |
| LIST-05 | Série favorita | Enter | Abrir detalhes da série correta |  | NÃO TESTADO |
| LIST-06 | Entre seções | Cima/Baixo | Trocar de seção mantendo coluna aproximada |  | NÃO TESTADO |

---

# F. Configurações

| ID | Posição inicial | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| SET-01 | Tela recém-aberta | — | Foco na primeira configuração útil |  | NÃO TESTADO |
| SET-02 | Opção | Cima/Baixo | Próxima/anterior opção da mesma coluna |  | NÃO TESTADO |
| SET-03 | Controle de valor | Esquerda/Direita | Alterar valor sem sair inesperadamente |  | NÃO TESTADO |
| SET-04 | Botão | Enter | Executar uma única vez |  | NÃO TESTADO |
| SET-05 | Tela | Voltar | Retornar à tela anterior |  | NÃO TESTADO |

---

# G. Player de canal ao vivo

| ID | Estado | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| PLIVE-01 | Vídeo iniciando | — | Uma única tela de carregamento | Há múltiplas camadas possíveis | FALHA CONHECIDA |
| PLIVE-02 | Vídeo sem controles | Enter | Mostrar controles |  | NÃO TESTADO |
| PLIVE-03 | Controles visíveis | Enter | Executar apenas o botão focado | Atualmente tende a alternar play/pause globalmente | FALHA CONHECIDA |
| PLIVE-04 | Controles visíveis | Direita/Esquerda | Mover foco entre ações | Atualmente o player não possui navegação completa por foco | FALHA CONHECIDA |
| PLIVE-05 | Vídeo | Cima | Mostrar controles/área superior conforme estado |  | NÃO TESTADO |
| PLIVE-06 | Vídeo | Baixo | Mostrar controles/área inferior conforme estado |  | NÃO TESTADO |
| PLIVE-07 | Lista fechada | Ação Lista | Abrir lista na categoria do canal atual | Hoje mostra os primeiros 36 canais | FALHA CONHECIDA |
| PLIVE-08 | Lista aberta | Cima/Baixo | Navegar pelos canais |  | NÃO TESTADO |
| PLIVE-09 | Lista aberta | Voltar | Fechar lista, permanecer no player |  | NÃO TESTADO |
| PLIVE-10 | Player sem camada | Voltar | Voltar a TV ao vivo restaurando contexto |  | NÃO TESTADO |

---

# H. Player de filme

| ID | Estado | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| PMOV-01 | Filme iniciando | — | Uma única tela de carregamento | Há múltiplas camadas possíveis | FALHA CONHECIDA |
| PMOV-02 | Vídeo sem controles | Esquerda | Retroceder 10 segundos com feedback |  | NÃO TESTADO |
| PMOV-03 | Vídeo sem controles | Direita | Avançar 10 segundos com feedback |  | NÃO TESTADO |
| PMOV-04 | Controles visíveis | Setas | Navegar entre controles | Atualmente as setas executam busca global | FALHA CONHECIDA |
| PMOV-05 | Barra focada | Direita/Esquerda | Ajustar posição com indicação visual |  | NÃO TESTADO |
| PMOV-06 | Opções abertas | Setas | Navegar somente dentro das opções |  | NÃO TESTADO |
| PMOV-07 | Opções abertas | Voltar | Fechar opções sem sair do player |  | NÃO TESTADO |
| PMOV-08 | Player | Voltar | Salvar progresso e voltar corretamente |  | NÃO TESTADO |
| PMOV-09 | Retomar filme | — | Começar próximo da posição salva |  | NÃO TESTADO |

---

# I. Player de episódio

| ID | Estado | Tecla | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|---|
| PEPI-01 | Episódio iniciando | — | Uma única tela de carregamento | Há múltiplas camadas possíveis | FALHA CONHECIDA |
| PEPI-02 | Opções/Episódios | Setas | Navegar pelos episódios sem buscar o vídeo |  | NÃO TESTADO |
| PEPI-03 | Episódio selecionado | Enter | Trocar para episódio correto |  | NÃO TESTADO |
| PEPI-04 | Aviso próximo episódio | Esquerda/Direita | Alternar Assistir agora/Cancelar | O bridge atual não implementa essa alternância | FALHA CONHECIDA |
| PEPI-05 | Aviso próximo episódio | Enter | Executar ação focada | Atualmente tende a executar Assistir agora | FALHA CONHECIDA |
| PEPI-06 | Aviso próximo episódio | Voltar | Cancelar aviso, não sair do player |  | NÃO TESTADO |
| PEPI-07 | Sair e retomar | — | Abrir último episódio e posição correta |  | NÃO TESTADO |

---

# J. Testes de foco e regressão

| ID | Cenário | Resultado desejado | Resultado atual | Status |
|---|---|---|---|---|
| REG-01 | Conteúdo é carregado enquanto um item está focado | Foco não desaparece |  | NÃO TESTADO |
| REG-02 | Trocar categoria | Foco vai para primeiro item da nova categoria |  | NÃO TESTADO |
| REG-03 | Voltar de detalhes | Foco retorna ao card de origem |  | NÃO TESTADO |
| REG-04 | Abrir e fechar modal | Foco retorna ao elemento que abriu o modal |  | NÃO TESTADO |
| REG-05 | Manter seta pressionada | Navegação contínua, sem saltos excessivos |  | NÃO TESTADO |
| REG-06 | Pressionar Enter rapidamente duas vezes | Uma única ação relevante |  | NÃO TESTADO |
| REG-07 | Lista com imagens carregando | Foco não muda sozinho |  | NÃO TESTADO |
| REG-08 | Grade com botão Carregar mais | Foco permanece previsível após expansão |  | NÃO TESTADO |
| REG-09 | Controle sem tecla Menu | Todas as funções essenciais continuam acessíveis |  | NÃO TESTADO |
| REG-10 | Reabrir uma tela | Último item importante pode ser restaurado |  | NÃO TESTADO |

---

# Critérios para aprovar a futura Fase 1

A nova navegação geral somente poderá ser considerada aprovada quando:

- Filmes, Séries e TV ao vivo passarem nos testes principais;
- o menu não roubar foco;
- categorias funcionarem horizontalmente;
- grades preservarem coluna verticalmente;
- detalhes restaurarem o item de origem;
- o foco estiver sempre visível;
- nenhuma tecla executar duas ações;
- o aplicativo continuar funcional com mouse e toque;
- o build, TypeScript e parser M3U continuarem passando;
- o teste ocorrer em pelo menos uma TV ou TV Box real.

## Registro do ambiente de teste

```text
Data:
APK/commit:
Aparelho:
Versão do Android:
Controle:
Resolução:
Lista usada:
Observações:
```
