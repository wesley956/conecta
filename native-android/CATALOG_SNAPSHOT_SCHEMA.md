# Snapshot local do catálogo Android — schema v2

O schema v2 transforma o snapshot em um catálogo local utilizável depois que o
backend confirma que o aparelho continua ativo. Ele não substitui autorização,
mas evita baixar e reinterpretar o mesmo conteúdo em toda abertura.

## Gate de autorização

O Android consulta `device-config` antes de solicitar a restauração. Somente
`DeviceAccessStatus.Active` permite leitura. `Blocked`/`Revoked`, `Expired` e o
reset seguro apagam os snapshots locais antes de qualquer nova ativação.

## Envelope v2

- `schemaVersion`;
- hash SHA-256 do código do dispositivo;
- `playlistId` e papel `primary`/`backup`;
- fingerprint SHA-256 da forma não secreta da configuração;
- `savedAt` e versão do app;
- contagens de canais, filmes e séries;
- checksum SHA-256 do payload;
- payload completo do catálogo autorizado.

O nome do arquivo também é derivado por hash. O arquivo não contém código do
dispositivo em claro.

## Proteção de dados

O payload inclui nomes, imagens, URLs de reprodução e alternativas necessárias
para abrir o conteúdo sem nova consulta. Antes de chegar ao disco ele é:

- comprimido com GZIP;
- criptografado e autenticado com AES-256-GCM;
- vinculado por AAD ao hash do aparelho e ao ID da lista;
- protegido por chave não exportável do Android Keystore;
- gravado atomicamente no diretório privado `noBackupFilesDir`.

Código do aparelho, credencial do dispositivo e configuração bruta da lista não
ficam no envelope. Alteração de lista, revisão, manifest ou configuração muda o
fingerprint e impede o reaproveitamento incorreto.

## Validade e integridade

- revisões com `cacheVersion`/manifest iguais são autoritativas e não recarregam;
- origens diretas sem revisão autoritativa usam TTL de frescor de 12 horas;
- depois do TTL direto, o conteúdo continua visível e atualiza após a abertura;
- retenção máxima: 90 dias;
- limite criptografado: 32 MiB; limite expandido protegido: 96 MiB;
- schema desconhecido, checksum divergente, truncamento, contagens inválidas ou
  identidade/fingerprint incompatíveis descartam o arquivo;
- carga vazia ou parcial com falha de seção não substitui um snapshot bom;
- escrita usa `AtomicFile`, `fsync`, commit/failWrite e ocorre fora da main thread.

## Concorrência e fluidez

- cada bootstrap/refresh recebe uma geração monotônica;
- novo refresh ou configuração cancela o Job anterior;
- somente a geração atual pode publicar estado ou persistir snapshot;
- conteúdo utilizável permanece visível durante refresh e em falha transitória;
- carga progressiva de canais nunca apaga filmes e séries restaurados;
- snapshot fresco encerra o bootstrap sem nova consulta de catálogo;
- snapshot direto stale adia a rede por 9 segundos, depois do vídeo de abertura;
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
- `catalog.snapshot_save_failed`: falha de persistência sem dados sensíveis;
- `catalog.snapshot_startup_ready`: segundo acesso concluído sem rede de catálogo;
- `catalog.hydration_ready`: contagens após hidratação progressiva.

Nenhum evento inclui URL, host, ID de lista ou credencial.

## Homologação física e promoção

No APK de homologação, medir em cold start e warm reopen:

1. vídeo H.264/AAC completo de 8,057 segundos sem frame perdido;
2. tempo até Home útil;
3. tempo até canais visíveis;
4. tempo até filmes/séries visíveis;
5. segundo acesso sem chamadas de catálogo quando a revisão não mudou;
6. maior frame durante hidratação e resposta do D-pad;
7. pico de memória/PSS e comportamento em TV Box low-RAM;
8. principal → reserva, refresh duplo, background/retorno e entrada no player.

O candidato 2.9.7 foi testado fisicamente em TV em 13/08/2026. O vídeo completo,
a restauração do cache e a reabertura do conteúdo foram aprovados. A transição
final por crossfade foi adicionada após o teste e autorizada para promoção
comercial condicionada à suíte automatizada e à compilação assinada verdes.
