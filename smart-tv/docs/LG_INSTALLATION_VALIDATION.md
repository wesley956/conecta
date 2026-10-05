# LG-01 — Validação física de instalação webOS

Este documento é o runbook obrigatório para fechar a issue #239. O build/CI comprova o pacote; somente uma TV LG física comprova instalabilidade real, primeiro boot, upgrade e reabertura após reinício.

## Baseline

- App ID: `com.ronecaplaytv.app`
- Baseline Android de paridade: `2.9.8` (`versionCode 49`, tag `v2.9.8`, commit `48de0c8`)
- webOS mínimo oficial: `4.x`
- Frontend mínimo planejado: Chromium 53
- Artefato oficial: packaged IPK (não hosted)

## Matriz de compatibilidade

| Faixa | webOS | Objetivo |
|---|---|---|
| Legacy | 4.x | pior caso oficialmente suportado |
| Intermediária antiga | 5.x / 6.x | hardware antigo/intermediário |
| Intermediária recente | 22 / 23 | geração recente |
| Atual | 24 / 25 / 26 | geração corrente |

A homologação final LG-10 deve possuir evidência representativa das faixas disponíveis. Para fechar LG-01, pelo menos uma TV física suportada precisa comprovar instalação/launch; o caso Legacy 4.x permanece requisito de compatibilidade do ciclo e deve ser coberto antes do Stable final.

## Pré-requisitos

1. Developer Mode habilitado na TV.
2. TV cadastrada no webOS CLI (`ares-setup-device`).
3. Sessão/chave da TV válida.
4. IPK baixado diretamente do artifact do workflow que o gerou.
5. `SHA256SUMS` e `webos-release-metadata.json` do mesmo workflow.

Nunca testar um IPK recompilado localmente e depois promover outro arquivo. O SHA-256 testado precisa ser o SHA-256 candidato à promoção.

## Variáveis de exemplo

```bash
DEVICE=myTV
APP_ID=com.ronecaplaytv.app
IPK=./com.ronecaplaytv.app_1.1.0_all.ipk
```

## 1. Conferir dispositivo e estado anterior

```bash
ares-install --device-list
ares-install --device "$DEVICE" --list --type web
```

Registrar a versão do webOS/modelo da TV na evidência da execução.

## 2. Remoção e instalação limpa

Se existir versão anterior e o teste for de instalação limpa:

```bash
ares-install --device "$DEVICE" --remove "$APP_ID"
```

Instalar o IPK e guardar a saída:

```bash
mkdir -p evidence
ares-install --device "$DEVICE" -v "$IPK" 2>&1 | tee evidence/install-clean.log
```

Critérios:

- comando termina com sucesso;
- app aparece em `--list --type web`;
- App ID é exatamente `com.ronecaplaytv.app`;
- nenhuma mensagem de pacote/manifest inválido.

## 3. Primeiro boot

```bash
ares-launch --device "$DEVICE" "$APP_ID" 2>&1 | tee evidence/launch-first.log
```

Validar na TV:

- aplicativo abre sem fechar sozinho;
- não há tela preta permanente;
- splash/entrada progride para o primeiro estado válido;
- controle remoto responde;
- não há reinício/loop da aplicação.

## 4. Segundo boot

Fechar e abrir novamente:

```bash
ares-launch --device "$DEVICE" --close "$APP_ID"
ares-launch --device "$DEVICE" "$APP_ID" 2>&1 | tee evidence/launch-second.log
```

Critério: segunda abertura é tão válida quanto a primeira e não depende de resíduo do processo anterior.

## 5. Upgrade N → N+1

1. Instalar e abrir o último IPK Stable conhecido (N).
2. Criar estado verificável quando as respectivas funções estiverem implementadas: ativação, favorito, progresso VOD e preferência.
3. Sem remover N, instalar N+1:

```bash
ares-install --device "$DEVICE" -v "$IPK" 2>&1 | tee evidence/install-upgrade.log
```

4. Abrir N+1 e verificar:
   - mesma identidade lógica do aparelho;
   - sem ativação duplicada no painel;
   - favoritos/progresso preservados quando a persistência LG-P05 estiver implementada;
   - preferências válidas preservadas/migradas;
   - app inicia normalmente.

Até a camada de persistência da LG-P05 estar implementada, o subgate de dados deve permanecer explicitamente pendente — nunca ser marcado como aprovado por suposição.

## 6. Reinício da TV

Com o app já instalado:

1. fechar o app;
2. reiniciar/desligar e ligar a TV de forma normal;
3. aguardar o webOS estabilizar;
4. executar:

```bash
ares-launch --device "$DEVICE" "$APP_ID" 2>&1 | tee evidence/launch-after-reboot.log
```

Critério: o app reabre sem reinstalação e sem corrupção do estado básico.

## 7. Reinstalação

Executar:

```bash
ares-install --device "$DEVICE" --remove "$APP_ID"
ares-install --device "$DEVICE" -v "$IPK" 2>&1 | tee evidence/reinstall.log
```

Validar que a reinstalação limpa não deixa pacote parcialmente instalado. Recuperação de dados após uninstall/reinstall segue a política de backend/DB8 da LG-P05 e terá gate próprio quando implementada.

## 8. Evidências obrigatórias

Anexar/registrar na issue ou no relatório de homologação:

- versão do IPK;
- SHA-256;
- commit Git;
- modelo da TV;
- versão webOS;
- data/hora;
- `install-clean.log`;
- `launch-first.log`;
- `launch-second.log`;
- `install-upgrade.log` quando aplicável;
- `launch-after-reboot.log`;
- resultado PASS/FAIL de cada etapa;
- foto/vídeo somente quando útil, sem credenciais visíveis.

## 9. Gate de bloqueio

LG-01 permanece aberta se qualquer um destes itens falhar:

- instalação limpa;
- lançamento por `ares-launch`;
- segundo boot;
- reabertura após reboot;
- estrutura/hash do IPK;
- upgrade N → N+1 quando houver N elegível;
- preservação de identidade/dados quando a persistência correspondente estiver implementada.

Build verde não substitui teste físico.
