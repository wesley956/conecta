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
| Splash/abertura |  |  |  |  |  |  |
| Vídeo/crossfade | MP4 oficial; fade a partir de 6,5 s | MP4 derivado da mesma fonte; app montado atrás do overlay |  |  |  | #293 |
| Ativação |  |  |  |  |  |  |
| Home |  |  |  |  |  |  |
| Busca |  |  |  |  |  |  |
| Canais |  |  |  |  |  |  |
| Filmes |  |  |  |  |  |  |
| Detalhe de filme |  |  |  |  |  |  |
| Séries |  |  |  |  |  |  |
| Detalhe de série/temporadas/episódios |  |  |  |  |  |  |
| Player ao vivo |  |  |  |  |  |  |
| Player VOD |  |  |  |  |  |  |
| Áudio/legendas |  |  |  |  |  |  |
| Aspecto da imagem |  |  |  |  |  |  |
| Configurações |  |  |  |  |  |  |
| Categorias Clássica/Painel lateral |  |  |  |  |  | #296 |
| Suporte responsável/QR |  |  |  |  |  | #295 |
| Diagnóstico |  |  |  |  |  |  |
| Snapshot/cache de startup | Snapshot seguro local e refresh em segundo plano | IndexedDB criptografado e refresh em segundo plano |  |  |  | #294 |
| Failover/recovery |  |  |  |  |  |  |

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
