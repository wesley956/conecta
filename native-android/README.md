# RonecaPlayTV Native Android

Cliente Android nativo oficial da RonecaPlayTV para Android TV, Google TV, TV Box, celulares e tablets.

> **Baseline oficial:** [Issue #266 — MASTER ANDROID](https://github.com/wesley956/conecta/issues/266)
>
> Este README descreve a arquitetura e o estado funcional atual. Mudanças relevantes de produto, player, segurança, backend, performance ou release devem ser registradas em Issue própria e referenciar a MASTER.

## Estado atual

Baseline Android auditada em **11/08/2026**:

- versão: **2.9.5**
- `versionCode`: **46**
- `applicationId`: `com.ronecaplaytv.nativeapp`
- `compileSdk`: 36
- `minSdk`: 23
- `targetSdk`: 36
- Java: 17
- stack principal: Kotlin, Jetpack Compose, Compose for TV, AndroidX Media3/ExoPlayer, Coroutines, Coil e OkHttp

A release 2.9.5 é também a referência Android congelada usada pelo ciclo atual de homologação LG.

## Plataformas

O mesmo cliente nativo atende:

- Android TV e Google TV;
- TV Box Android;
- celulares Android;
- tablets Android.

A interface é adaptativa:

- **TV:** navegação por D-pad, foco, controles a distância e políticas de reprodução adequadas ao dispositivo;
- **touch:** toque, orientação adaptativa e layouts/controles compactos.

A arquitetura Android oficial é nativa e não depende do antigo cliente WebView/Capacitor.

## Arquitetura atual

O código principal está em `native-android/app/src/main/java/com/ronecaplaytv/nativeapp/` e possui áreas dedicadas para:

- `activation/` — ativação e vínculo do aparelho;
- `catalog/` — catálogo, carregamento, estratégias M3U/Xtream e identidade de conteúdo;
- `diagnostics/` — diagnóstico sanitizado de processo e reprodução;
- `network/` — comunicação com Edge Functions e contratos de backend;
- `persistence/` — favoritos, progresso e estado local reconstruível;
- `platform/` — comportamento específico por tipo de aparelho;
- `security/` — identidade e credencial protegida do dispositivo;
- `series/` — dados e fluxos de séries;
- `ui/` — telas, navegação e componentes adaptativos;
- `update/` — consulta, download, validação e instalação de atualizações.

O player possui componentes próprios para reprodução, navegação por teclas, chrome/controles, aspecto, política de falha, load control, recovery e séries.

## Ativação e segurança do aparelho

O aplicativo está integrado ao Supabase para ativação e configuração do dispositivo.

A credencial do aparelho é armazenada com **AES/GCM** usando chave mantida pelo **AndroidKeyStore**. Ela é utilizada somente nos fluxos protegidos que exigem autenticação do dispositivo.

Contratos principais incluem, entre outros:

- `device-activate`;
- `device-config`;
- `device-unlink`;
- `playlist-cache`;
- `app-release`;
- `playback-diagnostics-report`.

## Catálogo e descoberta

O cliente atual suporta:

- canais ao vivo;
- filmes;
- séries, temporadas e episódios;
- busca;
- categorias e filtros;
- favoritos / Minha Lista;
- Continuar Assistindo e progresso;
- detalhes e recomendações;
- imagens com cache, fallback e interpolação de alta qualidade.

O carregamento de catálogo possui hidratação progressiva e pode reduzir/suspender trabalho concorrente durante playback em TV para preservar recursos.

## Listas, fontes e failover

O ecossistema suporta **lista principal + lista reserva por aparelho**.

Dentro de uma mesma lista podem existir múltiplos endpoints/origens. A regra operacional é:

1. tentar alternativas válidas da mesma lista;
2. somente depois considerar o failover comercial para a lista reserva.

O cliente trabalha com estratégias/endpoints compatíveis com Xtream, M3U, HLS e outras origens entregues pelo backend conforme a configuração cadastrada.

A ordem das origens é preservada e, quando possível, a identidade lógica do conteúdo é usada para reencontrar o mesmo item entre origens/listas.

## Player Media3

A reprodução utiliza AndroidX Media3/ExoPlayer.

Recursos consolidados:

- Live, filmes e episódios;
- play/pause;
- rewind/fast-forward e timeline VOD;
- seek por controle remoto e toque conforme o dispositivo;
- navegação por D-pad dentro do player;
- modos de aspecto **Original / Preencher / Estender**;
- navegação contextual de canais/episódios quando aplicável;
- próximo episódio e fluxo de séries;
- preservação de posição VOD durante recovery/failover;
- controles Media3 de legenda/settings quando o conteúdo e o player expõem essas faixas.

Áudio/legendas dependem das faixas realmente fornecidas pelo conteúdo e do suporte Media3; não existe neste baseline uma promessa de um subsistema separado independente dessas capacidades.

## Resiliência de reprodução

O player não utiliza retry cego como estratégia principal.

O baseline atual inclui:

- classificação de falhas;
- backoff progressivo de **2 / 4 / 8 segundos** para falhas transitórias;
- tratamento diferenciado para 401/403, 404, formato, decoder e TLS;
- recovery e watchdog serializados;
- janela de estabilidade de **8 segundos** antes de validar recovery/failover;
- confirmação da lista reserva somente após avanço real da reprodução;
- reconstrução da sessão ExoPlayer em falhas relevantes de VOD;
- fallback de decoder hardware → software em cenário compatível com `FAILED_RUNTIME_CHECK`;
- preservação da posição de filmes/episódios durante tentativas de recuperação.

## Performance e lifecycle

O cliente possui políticas específicas para reduzir disputa de recursos em TVs e aparelhos mais limitados:

- load control adaptado, inclusive para dispositivos low-RAM;
- tratamento do lifecycle da Activity durante playback;
- suspensão/cancelamento de trabalhos de catálogo concorrentes durante reprodução em TV quando aplicável;
- URLs Xtream compactadas para playback conforme configuração atual.

Mudanças nessas áreas devem sempre ser acompanhadas de regressão dirigida em hardware real quando afetarem decoder, foco, lifecycle ou performance.

## Diagnóstico

O diagnóstico de reprodução é sanitizado por regra de produto.

O cliente pode registrar estado, posição, duração, modo de decoder e cadeia de falhas relevantes sem enviar URLs completas ou credenciais.

O contrato de diagnóstico protege explicitamente campos sensíveis como URL de lista, URL de stream e origem completa.

## Identidade visual

A identidade atual foi consolidada na 2.9.5:

- base grafite/vermelha alinhada ao painel;
- **Roneca** branco;
- **Player** dourado;
- **TV** vermelho;
- masters vetoriais oficiais em `native-android/brand/`;
- splash e ativação derivados da mesma identidade;
- launcher adaptativo, legado e redondo com safe area própria;
- identidade/banner Android TV derivados da mesma fonte oficial.

Evite manter wordmarks ou logomarcas paralelas independentes da fonte oficial.

## Atualização e distribuição

O aplicativo possui fluxo próprio de atualização autenticada.

O processo atual inclui:

- consulta ao `app-release` usando a identidade/credencial do aparelho;
- autorização apenas para dispositivo válido/ativo;
- download por HTTPS e hosts permitidos;
- limite de tamanho do APK;
- verificação SHA-256;
- validação de package e versão;
- comparação de assinatura quando o firmware expõe os certificados do APK antes da instalação;
- validação final obrigatória pelo instalador do Android;
- assinatura de release configurada por variáveis protegidas de ambiente;
- minify e shrink resources no build release.

O painel/backend distribui somente releases publicados conforme o contrato de `app_releases`.

## Compilação e CI

O projeto utiliza Gradle e Java 17.

Exemplos locais:

```bash
cd native-android
gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug
```

O pipeline global do repositório possui gate específico para o cliente Android, incluindo testes e compilação do APK debug, além de verificações de arquitetura, player, segurança, identidade e integração com o restante do ecossistema.

## Release notes

Mudanças por versão ficam em:

- `native-android/RELEASE_NOTES.md`

A MASTER #266 é a referência para o estado consolidado e para o processo de evolução futura.

## Áreas de alto risco

Alterações nestas áreas exigem atenção especial:

1. player / Media3 / decoder;
2. recovery / watchdog / failover;
3. lista principal/reserva e múltiplas origens;
4. ativação / identidade / credencial;
5. favoritos / progresso / persistência;
6. D-pad / foco / Back em TV;
7. mobile / orientação / telas pequenas;
8. catálogo / hidratação / low-RAM;
9. atualização / assinatura / checksum;
10. identidade vetorial / launcher / splash;
11. contrato Android ↔ Supabase ↔ painel.

## Regra de evolução

Não reconstruir retrospectivamente uma Issue para cada microajuste antigo.

A partir da baseline atual, abrir Issue própria para:

- bugs;
- novas funções;
- mudanças relevantes de UI/UX;
- player/recovery/failover;
- segurança;
- backend/API;
- persistência;
- update/release;
- performance/compatibilidade;
- refatoração arquitetural relevante.

Toda mudança deve registrar comportamento atual, comportamento esperado, riscos, critérios de aceite, evidência de teste e PR/release correspondente.
