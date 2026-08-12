# Snapshot local do catálogo Android — schema v1

Referência: Issues #270 e #271. Este snapshot acelera somente a reconstrução da
interface. Ele não substitui a autorização do backend, a configuração protegida
nem os caches internos dos provedores.

## Gate de autorização

O Android consulta `device-config` antes de solicitar a restauração. Somente
`DeviceAccessStatus.Active` permite leitura. `Blocked`/`Revoked`, `Expired` e o
reset seguro apagam os snapshots locais antes de qualquer nova ativação.

## Envelope v1

- `schemaVersion`;
- hash SHA-256 do código do dispositivo;
- `playlistId` e papel `primary`/`backup`;
- fingerprint SHA-256 da forma não secreta da configuração;
- `savedAt` e versão do app;
- contagens de canais, filmes e séries;
- checksum SHA-256 do payload;
- payload de metadados visíveis.

O nome do arquivo também é derivado por hash. O arquivo não contém código do
dispositivo em claro.

## Dados deliberadamente excluídos

O snapshot não serializa:

- URL primária ou alternativas de reprodução;
- URL de logo, capa ou poster;
- usuário, senha, token, header ou credencial;
- URLs marcadas usadas pelos clientes Xtream/M3U;
- credencial segura do dispositivo.

Ao restaurar, os campos de URL ficam vazios. Eles somente voltam ao estado em
memória após uma carga válida usando a configuração protegida revalidada.

## Validade e integridade

- TTL de frescor: 12 horas. Depois disso o conteúdo ainda pode ser mostrado
  como stale após autorização ativa, enquanto revalida.
- retenção máxima: 30 dias;
- limite por arquivo: 24 MiB;
- schema desconhecido, checksum divergente, truncamento, contagens inválidas ou
  identidade/fingerprint incompatíveis descartam o arquivo;
- carga vazia ou parcial com falha de seção não substitui um snapshot bom;
- escrita usa `AtomicFile`, `fsync`, commit/failWrite e ocorre fora da main thread.

## Concorrência e fluidez

- cada bootstrap/refresh recebe uma geração monotônica;
- novo refresh ou configuração cancela o Job anterior;
- somente a geração atual pode publicar estado ou persistir snapshot;
- conteúdo utilizável permanece visível durante refresh e em falha transitória;
- hidratação progressiva continua suspensa durante playback em TV;
- aparelhos low-RAM consultam as três seções sequencialmente para reduzir pico
  de alocação, mantendo rede e parsing fora da main thread;
- listas Compose continuam usando chaves estáveis já existentes.

## Métricas sem dados sensíveis

Eventos locais de diagnóstico:

- `catalog.snapshot_restored`: tempo de leitura, idade, tamanho e contagens;
- `catalog.snapshot_restored_memory`: heap/PSS após restauração;
- `catalog.network_ready`: tempo até catálogo revalidado e contagens;
- `catalog.snapshot_saved`: tamanho e contagens persistidas;
- `catalog.hydration_ready`: contagens após hidratação progressiva.

Nenhum evento inclui URL, host, ID de lista ou credencial.

## Homologação física pendente

No APK de homologação, medir em cold start e warm reopen:

1. tempo até Home útil;
2. tempo até canais visíveis;
3. tempo até filmes/séries visíveis;
4. maior frame durante hidratação e resposta do D-pad;
5. pico de memória/PSS e comportamento em TV Box low-RAM;
6. principal → reserva, refresh duplo, background/retorno e entrada no player.

Esses resultados físicos completam a definição de pronto; não autorizam
promoção ou atualização automática.
