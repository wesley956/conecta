# LG 2.9.8 — Pacote 1 (#292, #293, #294)

## Referência congelada

- Produto Android: RonecaPlayTV 2.9.8.
- `versionCode`: 49.
- tag: `v2.9.8`.
- commit: `48de0c8`.
- webOS candidate: 1.1.0.

O IPK 1.0.0 e sua matriz 2.9.5 permanecem evidência histórica. A partir deste pacote, nenhum novo candidate pode declarar a 2.9.5 como baseline ativa.

## #292 — baseline e matriz

- scripts de package/homologação exigem baseline 2.9.8;
- matriz e runbook identificam a release Android exata;
- novo gate `validate:lg-2.9.8-pack` confere Android, vídeo, cache e documentação;
- promoção Stable continua dependendo de evidência física A/B/C/N/A.

## #293 — vídeo e crossfade

- fonte única: `native-android/app/src/main/res/raw/roneca_launch_video.mp4`;
- o build copia o mesmo arquivo para o pacote Smart TV;
- duração esperada: 8,057 s;
- início do fade: 6,5 s;
- aplicação React e bootstrap ficam montados atrás do overlay;
- áudio respeita a preferência existente;
- teclas de navegação ficam bloqueadas durante o overlay;
- `src` e decoder são liberados ao terminar, falhar ou após 12 s;
- falha de autoplay/codec retorna ao app sem bloquear a abertura.

## #294 — snapshot seguro

- armazenamento: IndexedDB dedicado ao cache reconstruível;
- conteúdo: catálogo completo da última sincronização válida;
- proteção em repouso: AES-GCM 256 com chave não exportável;
- isolamento: hash SHA-256 de aparelho + playlist;
- validade: sete dias;
- limites: 250 mil itens e 80 MiB antes da criptografia;
- refresh remoto ocorre em segundo plano e só substitui o snapshot após sucesso;
- lista reserva possui snapshot independente;
- corrupção, falta de WebCrypto/IndexedDB ou quota insuficiente não bloqueiam o app;
- limpar cache remove o banco reconstruível, sem tocar identidade, biblioteca ou preferências.

## Gates ainda físicos

- fluidez/crossfade e áudio em TV LG;
- suporte H.264 Main/AAC-LC nos modelos alvo;
- primeira versus segunda abertura com catálogo grande;
- quota/evicção/tempo de criptografia em webOS antigo;
- offline → online, reboot, standby/resume e atualização 1.0.0 → 1.1.0;
- confirmação de que somente um decoder permanece ativo.
