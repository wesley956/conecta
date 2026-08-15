# LG-10 — Matriz de paridade Android APK × LG IPK

Android de referência: **RonecaPlayTV 2.9.8** (`versionCode 49`, tag `v2.9.8`, commit `48de0c8`).

Esta revisão substitui a antiga baseline 2.9.5. O RC 1.0.0 anterior permanece histórico e não comprova paridade com o APK comercial atual.

## Classificação

- **A — praticamente idêntico**: mesma intenção, fluxo e resultado; diferenças cosméticas irrelevantes.
- **B — equivalente**: mesma função/resultado, com diferença justificada por webOS, controle remoto, player ou recurso de plataforma.
- **C — divergente**: comportamento/visual/resultado incompatível com a referência e precisa correção.
- **N/A — não aplicável**: recurso não existe naquela plataforma; justificar.

Nenhum **C crítico** pode permanecer no RC aprovado.

## Identidade do RC testado

- Versão LG:
- Commit:
- Arquivo IPK:
- SHA-256:
- Artifact ID:
- Modelo LG:
- webOS:
- Android de comparação/modelo:
- Data:
- Tester:

## Matriz obrigatória

| Área | Android 2.9.8 | LG webOS 1.1.0 | Classe | Evidência | Diferença/justificativa | Ação |
| --- | --- | --- | --- | --- | --- | --- |
| Splash/abertura | Overlay sobre app montado | Overlay sobre app montado | Pendente físico | #293 | Mesmo MP4 | #293 |
| Vídeo/crossfade | MP4 oficial; fade a partir de 6,5 s | Mesma fonte; app atrás do overlay | Pendente físico | gate Pack 1 | Decoder difere por plataforma | #293 |
| Ativação | Estados + código + suporte | Estados + código + suporte | C parcial | #295 | QR local ainda pendente | #295 |
| Home | Hero, atalhos, linhas e estados | Hero, atalhos, linhas e estados | Pendente físico | auditoria #298 | Composição equivalente para FHD | #298 |
| Busca | Vazia, grupos e sem resultado | Vazia, grupos e sem resultado | Pendente físico | auditoria #298 | Teclado depende do webOS | #298 |
| Canais | Busca, filtros, favoritos e grade | Busca, filtros, favoritos e grade | Pendente físico | LG-04 + #296 | HTML/CSS equivalente | #298 |
| Filmes | Filtros, posters, progresso | Filtros, posters, progresso | Pendente físico | LG-04/05 | HTML/CSS equivalente | #298 |
| Detalhe de filme | Metadados, favorito, recomendações | Metadados, favorito, recomendações | Pendente físico | LG-05 | HTML/CSS equivalente | #298 |
| Séries | Filtros, posters, progresso | Filtros, posters, progresso | Pendente físico | LG-04/05 | HTML/CSS equivalente | #298 |
| Detalhe de série/temporadas/episódios | Temporadas, fila, retomada | Temporadas, fila, retomada | Pendente físico | LG-05 | HTML/CSS equivalente | #298 |
| Player ao vivo | Media3 | HTML5/webOS | B pendente físico | LG-06/07 | Engine/decoder diferentes | #300 |
| Player VOD | Media3 | HTML5/webOS | B pendente físico | LG-06/07 | Engine/decoder diferentes | #300 |
| Áudio/legendas | Tracks Media3 + Desativadas | Tracks expostas pelo webOS + Desativadas | B pendente físico | #297 | Disponibilidade depende do firmware/conteúdo | #297 |
| Aspecto da imagem | Original/Preencher/Estender | contain/cover/fill | B pendente físico | LG-06 | Implementação nativa versus CSS | #300 |
| Configurações | Grupos Android | Grupos equivalentes webOS | B pendente físico | #299 | Decoder e instalação diferem | #299 |
| Categorias Clássica/Painel lateral | Dois modos, painel 18% | Dois modos, painel 18% | Pendente físico | #296 | Implementação Compose versus DOM | #296 |
| Suporte responsável/QR | Perfil + QR local | Perfil integrado; QR pendente | C parcial | #295 | Não usar gerador externo | #295 |
| Diagnóstico | Nativo sanitizado | Web sanitizado + backend | B pendente físico | LG-08 + #299 | APIs de plataforma diferentes | #299 |
| Snapshot/cache de startup | Snapshot criptografado e refresh em segundo plano | IndexedDB AES-GCM e refresh em segundo plano | B pendente físico | #294 | Keystore versus CryptoKey não exportável | #294 |
| Failover/recovery | Media3 + listas/origens | Watchdog + listas/origens | B pendente físico | LG-07 | Engines diferentes | #300 |

## Gates físicos complementares

| Gate | Resultado | Evidência | Observação |
| --- | --- | --- | --- |
| Instalação limpa |  |  |  |
| Segunda abertura |  |  |  |
| Reboot da TV + reabertura |  |  |  |
| Atualização N→N+1 |  |  |  |
| Identidade preservada |  |  |  |
| Favoritos preservados |  |  |  |
| Progresso preservado |  |  |  |
| Preferências preservadas |  |  |  |
| Catálogo grande |  |  |  |
| Série grande |  |  |  |
| Queda/retorno de internet |  |  |  |
| Source switch |  |  |  |
| Failover principal → reserva |  |  |  |
| Standby/resume |  |  |  |
| 30 minutos de navegação |  |  |  |
| 20 ciclos Live/VOD |  |  |  |
| CPU/memória sem crescimento contínuo |  |  |  |
| Apenas um player ativo |  |  |  |

## Resumo de classificação

- A:
- B:
- C não críticos:
- C críticos:
- N/A:

## Decisão

- [ ] Nenhum C crítico permanece.
- [ ] Todas as diferenças B têm justificativa.
- [ ] O SHA testado é exatamente o SHA do RC destinado à promoção.
- [ ] Evidências físicas estão anexadas/registradas.
- [ ] LG-01→LG-09 estão fisicamente concluídos ou formalmente aceitos.
- [ ] RC apto à promoção segundo LG-P07.

Aprovação LG-10:
- Responsável:
- Data:
- Observações:
