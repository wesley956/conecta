# Cadastro universal de fontes — especificação aprovada

Esta especificação registra o escopo aprovado para o painel RonecaPlayTV.

## Objetivo

Substituir o cadastro simples de URL por um cadastro universal de fontes, mantendo compatibilidade com as listas atuais e permitindo uma única conta com vários endpoints e estratégias de acesso.

## Modos de entrada

- Detecção automática por mensagem completa do fornecedor.
- URL M3U, M3U Plus, M3U8 ou HLS.
- Credenciais Xtream com protocolo, servidor, porta, caminho, usuário, senha e saída.
- Portal Stalker/MAG.
- API JSON/REST personalizada.
- Transmissão direta HLS, MPEG-TS, DASH, RTMP ou RTSP.
- Lista manual.
- Arquivo M3U, M3U8 ou TXT.

## Importação de mensagem

O importador deve extrair, sem guardar o texto bruto:

- fornecedor;
- plano, preço, criação, vencimento e conexões;
- usuário e senha;
- servidores Xtream/DNS;
- links M3U completos e curtos;
- HLS completo e curto;
- SSIPTV;
- links de renovação, aplicativos e Downloader, sem tratá-los como streaming.

Uma mensagem com vários formatos deve gerar uma única fonte com vários endpoints, nunca várias listas duplicadas.

## Preservação da origem

- Guardar a URL original exatamente como informada.
- Extrair protocolo, domínio, porta, caminho, formato e parâmetros para diagnóstico.
- Testar primeiro a URL original.
- Registrar URL final e redirecionamentos de forma sanitizada.
- Nunca gravar usuário, senha, token, cookie ou URL completa nos logs.

## TLS por fonte

Cada fonte possui um dos modos:

- `strict`: validação normal, padrão.
- `custom_ca`: adiciona uma autoridade certificadora específica.
- `insecure`: ignora erros de certificado somente para os domínios autorizados.

O modo inseguro:

- exige aceite explícito do risco;
- nunca é global;
- é limitado à fonte e aos hosts autorizados;
- pode permitir subdomínios e hosts de redirecionamento somente quando selecionado;
- possui escopos separados para validação, cache, catálogo e reprodução;
- registra responsável, data e histórico;
- aparece visivelmente no cartão da fonte.

## Segurança

- Credenciais e cabeçalhos sensíveis ficam protegidos e não são enviados nas listagens comuns.
- Pré-visualizações sempre mascaram valores secretos.
- O texto original da mensagem não é persistido; somente hash e resumo sanitizado.
- Tabelas de configuração sensível são acessadas somente pelo backend com `service_role`.
- O cadastro administrativo e o cadastro do vendedor usam a mesma rotina canônica.

## Testes e diagnóstico

O teste deve separar:

- URL e DNS;
- protocolo e porta;
- certificado e redirecionamento;
- autenticação e status da conta;
- catálogo de canais, filmes e séries;
- reprodução de amostras;
- estratégia principal e alternativas.

Mensagens devem ser específicas e sanitizadas, com histórico por endpoint.

## Compatibilidade legada

As listas existentes continuam usando `panel_playlists.playlist_url` e `playlist_type` como endpoint principal. A nova estrutura adiciona endpoints e metadados sem alterar automaticamente status, URL ou vínculos existentes.

## Listas que devem ser preservadas

- GF
- Lista Camila
- Lista Pessoal João Bruno Não Usar
- Lista RonecaPlayTV uso próprio
- Ltc
