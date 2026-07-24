# ronecaPlayer TV — LG webOS e Samsung Tizen

Base compartilhada das versões para Smart TV. A versão Android é a referência
visual e comportamental obrigatória.

## Player nativo

- Samsung usa `AVPlay`, com preparação assíncrona e retângulo 1920 × 1080;
- LG webOS usa o elemento de vídeo conectado ao pipeline nativo;
- canais, filmes e episódios testam as origens de reprodução em ordem;
- séries M3U usam temporadas já presentes no cache;
- séries Xtream carregam episódios pela função protegida `series-detail`;
- URLs temporárias e credenciais permanecem somente no armazenamento privado do app.

## Distribuição

- versão atual compartilhada: `0.5.0`;
- `npm run stage:webos` prepara a estrutura oficial do pacote LG;
- `npm run stage:tizen` prepara a estrutura oficial do pacote Samsung;
- o painel consulta Android, LG e Samsung separadamente;
- arquivos publicados permanecem no bucket privado e usam links de uma hora;
- cada Smart TV verifica novas versões ao abrir e novamente a cada seis horas.

O instalador Android pode substituir o APK. LG e Samsung bloqueiam instalação
silenciosa por um aplicativo comum: atualização automática completa depende das
lojas oficiais. Em distribuição direta, o IPK usa Developer Mode e o WGT deve ser
assinado com o mesmo certificado Samsung e autorizado para o DUID da TV.
