# ronecaPlayer TV — LG webOS e Samsung Tizen

Base compartilhada das versões para Smart TV. A versão Android é a referência
visual e comportamental obrigatória.

## Player nativo

- Samsung usa `AVPlay`, com preparação assíncrona e retângulo 1920 × 1080;
- LG webOS usa o elemento de vídeo conectado ao pipeline nativo;
- canais, filmes e episódios testam as origens de reprodução em ordem;
- URLs temporárias permanecem somente em memória;
- controles compartilhados oferecem play, pausa, busca, progresso e voltar;
- controles somem após quatro segundos, como no Android;
- erros de formato, endereço e tempo limite são mostrados sem fechar o app;
- séries M3U usam temporadas e episódios já presentes no cache;
- séries Xtream carregam os episódios pela função protegida `series-detail`;
- a TV envia sua credencial individual e nunca recebe a senha do provedor.

O próximo marco prepara os pacotes assinados `.ipk` e `.wgt`, os downloads
separados no painel e o atualizador apropriado para cada fabricante.
