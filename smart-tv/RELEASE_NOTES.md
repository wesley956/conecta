# ronecaPlayer TV 1.1.0 — candidate de paridade Android 2.9.8

- baseline atualizada para o APK comercial 2.9.8 (`versionCode 49`, tag `v2.9.8`, commit `48de0c8`);
- vídeo oficial Android incluído no IPK a partir da mesma fonte versionada;
- Home e bootstrap iniciam atrás do overlay e aparecem por crossfade a partir de 6,5 s;
- D-pad, OK e Back ficam bloqueados durante a abertura;
- vídeo/decoder são liberados ao terminar, falhar ou atingir o timeout de segurança;
- catálogo válido é salvo em snapshot IndexedDB criptografado com AES-GCM e chave não exportável;
- segunda abertura restaura o catálogo local antes do refresh remoto;
- atualização em segundo plano não zera o último catálogo utilizável;
- snapshot é isolado por aparelho/lista, versionado, limitado e expira em sete dias;
- “Limpar cache temporário” remove o snapshot sem apagar ativação, favoritos, progresso ou preferências;
- Stable continua bloqueado até a homologação física do artifact exato.

# ronecaPlayer TV 1.0.0

Versão de paridade funcional com o aplicativo Android para LG webOS e Samsung Tizen:

- ativação segura pelo mesmo painel do Android;
- catálogo protegido de canais, filmes e séries;
- pesquisa, categorias, favoritos e continuar assistindo;
- filmes, temporadas, episódios e próximo episódio automático;
- EPG com programação atual e seguinte;
- áudio e legendas pelo player disponível em cada plataforma;
- buffer configurável de 2, 5 ou 10 segundos;
- reconexão automática sem fechar o player;
- troca de origens e failover para a lista reserva preservando a posição;
- mantém favoritos e progresso mesmo quando o fornecedor usa IDs diferentes na reserva;
- registra motivo, tentativa e resultado do failover no mesmo formato da versão Android;
- liga cada falha ao cache e ao painel por IDs seguros, sem registrar credenciais da lista;
- diagnóstico detalhado no painel administrativo e no portal do vendedor;
- registro de recuperação bem-sucedida para zerar falhas acumuladas;
- som de abertura configurável;
- atualização protegida por plataforma;
- IPK LG e estrutura WGT Samsung validados automaticamente;
- WGT Samsung assinado e publicado quando executado em runner com Tizen Studio e certificado configurado.
