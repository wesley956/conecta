# RonecaPlayTV 2.9.8 — homologação

- Move o crossfade final do ciclo de recomposição do Compose para uma única animação nativa preparada pela GPU, eliminando o engasgo do vídeo quando a marca aparece.
- Mantém o início da transição em 6,5 segundos, o MP4 e o áudio completos, a Home por baixo e todos os fallbacks da abertura.
- Candidato restrito ao pacote de homologação; sem publicação comercial ou envio pelo atualizador antes do novo teste físico.

# RonecaPlayTV 2.9.7

- Usa o MP4 oficial completo de 8 segundos como abertura local do Android, com áudio configurável e fallback de tempo/decoder.
- Revela a tela do aplicativo por baixo do vídeo com um crossfade suave entre 6,5 e 8,057 segundos, sem corte ou quadro preto no encerramento.
- Restaura canais, filmes, séries, imagens e reprodução de um snapshot AES-GCM comprimido após a autorização do aparelho.
- Evita baixar e reinterpretar novamente catálogos cuja revisão segura do backend permanece igual.
- Mantém filmes e séries visíveis enquanto a via rápida Xtream atualiza somente os canais.
- Adia atualização de origens diretas vencidas até depois da abertura e executa migrações de preferências fora da interface.
- Publica o conjunto aprovado na homologação física no APK comercial e no atualizador oficial.

# RonecaPlayTV 2.9.6

- Adiciona snapshot local seguro do catálogo para reaberturas mais rápidas, sem misturar dados entre aparelhos, contas ou listas.
- Mantém foco e navegação responsivos enquanto o catálogo é hidratado e as consultas são concluídas em segundo plano.
- Unifica a navegação por D-pad em Canais, Filmes e Séries, com retorno previsível entre menu, categorias e conteúdo.
- Permite escolher em `Configurações > Interface` entre categorias Clássicas e Painel lateral; em TVs, o painel compacto usa 18% da largura e mantém o foco vermelho evidente.
- Preserva automaticamente o modo Clássico em celulares e salva a preferência visual individualmente em cada aparelho.
- Torna a ativação responsiva e adiciona suporte oficial ou do vendedor, com contato e QR Code resolvidos pelo backend.
- Adiciona `Configurações > Suporte` com os dados do responsável pelo dispositivo, sem telefone ou e-mail fixos no aplicativo.
- Expõe no player as faixas de legenda detectadas pelo Media3 e permite selecionar ou desativar legendas durante a reprodução.

# RonecaPlayTV 2.9.5

- Consolida a identidade visual em uma única fonte: Roneca branco, Player dourado e TV vermelho.
- Faz splash e ativação consumirem o mesmo componente de marca, eliminando a versão em que Player e TV apareciam praticamente da mesma cor.
- Substitui o foreground do launcher por um vetor próprio com safe zone real para preservar as antenas sob máscaras de fabricantes.
- Faz launchers legado, redondo e adaptativo usarem o mesmo foreground vetorial, sem depender do PNG nodpi antigo.
- Faz o portal do vendedor usar diretamente o SVG oficial e remove o wordmark PNG e o SVG v2 paralelos.
- Remove a troca de identidade por JavaScript no painel e integra a criação do menu Mais ao módulo mobile realmente carregado pelo vendedor.

# RonecaPlayTV 2.9.4

- Reconstrói a sessão do ExoPlayer em falhas de VOD para não reutilizar uma instância que entrou em `IllegalStateException`.
- Implementa fallback real de decoder: ao ocorrer `FAILED_RUNTIME_CHECK` em hardware, o filme recria a sessão com `MediaCodecSelector.PREFER_SOFTWARE` e preserva a posição.
- Serializa recovery e watchdog para impedir duas recuperações concorrentes sobre o mesmo player.
- Exige uma janela estável de 8 segundos antes de marcar a reprodução como validada.
- Registra estado, posição, duração e modo de decoder no diagnóstico do erro.
- Amplia a safe area dos launchers Android e remove o uso do ícone legado antigo nos fallbacks.
- Unifica o wordmark de Admin e Vendedor pelo módulo visual compartilhado e mantém Roneca branco, Player dourado e TV vermelho no splash.

# RonecaPlayTV 2.9.3

- Publica de fato no Android as correções de identidade e VOD que já haviam sido mescladas após a 2.9.2.
- Separa `FAILED_RUNTIME_CHECK` de falhas reais de TLS/cleartext para eliminar a mensagem falsa de segurança do dispositivo.
- Registra o erro bruto do Media3 no backend antes da recuperação, com cadeia de causas sanitizada e sem expor URLs ou credenciais.
- Amplia a safe area dos ícones adaptive, legado e redondo para reduzir cortes por launchers Android.
- Padroniza o splash com a identidade oficial: Roneca branco, Player dourado e TV vermelho.
- Unifica o wordmark do painel e remove duplicação de marca no portal do vendedor.

# RonecaPlayTV 2.9.2

- Corrige definitivamente o espaçamento da marca Roneca Player TV na origem vetorial.
- Remove do splash a dependência do wordmark rasterizado que sobrepunha o nome e passa a compor Roneca, Player e TV com espaçamento seguro.
- Adiciona safe area também aos ícones launcher legados normal e redondo, evitando corte fora do Adaptive Icon.
- Atualiza o painel para usar o novo wordmark SVG corrigido e remove recorte visual da logomarca no login.
- Adiciona telemetria de BACK físico e ciclo de vida da Activity para diagnosticar a saída inesperada de filmes após alguns segundos de reprodução.

# RonecaPlayTV 2.9.1

- Corrige a marca na tela de ativação para manter espaçamento correto entre Roneca e Player TV.
- Mantém o player de filmes aberto após falha terminal e exibe o motivo da interrupção na própria reprodução.
- Compacta e torna rolável o menu lateral em telas baixas e no celular em modo paisagem, preservando acesso a Configurações.
- Simplifica o aspecto do vídeo para Original, Preencher e Estender, removendo os modos de largura/altura que causavam cortes extremos.
- Reduz o espaço ocupado pelo controle de aspecto no cabeçalho do player.
- Amplia a safe zone do ícone adaptativo para evitar corte da logomarca por launchers Android.

# RonecaPlayTV 2.9.0

- Nova identidade visual grafite e vermelha, alinhada aos painéis ADM e vendedor.
- Sistema vetorial oficial da marca, ícone adaptativo, banner Android TV e tela de ativação renovada.
- Controle de aspecto no player: Original, Preencher, Estender, Largura e Altura.
- Capas, banners e logotipos com interpolação de alta qualidade, cache nativo e fallback oficial.
- Reconexão inteligente: falhas temporárias usam espera progressiva de 2, 4 e 8 segundos.
- Erros 401/403, 404, formato, decoder e TLS deixam de repetir a mesma URL sem necessidade.
- Lista reserva somente é confirmada depois que a reprodução realmente avança.
- Posição de filmes e episódios preservada durante tentativas e failover.
- Mensagens de reprodução mais claras e diagnóstico seguro sem URLs ou credenciais.

# RonecaPlayTV Native 2.7.1

Compatibilidade universal de endpoints dentro da mesma lista.

- recebe no aparelho todos os endpoints ativos encontrados na mensagem do fornecedor;
- tenta as alternativas da mesma lista em sequência antes de considerar a fonte indisponível;
- separa o failover entre endpoints do failover comercial entre lista principal e reserva;
- evita repetir `/player_api.php` como M3U quando existe um `/get.php` completo cadastrado;
- preserva a ordem definida no painel, incluindo Xtream, M3U, HLS e links curtos;
- mantém a política TLS, os domínios autorizados e os cabeçalhos configurados para a fonte;
- registra as tentativas individuais sem expor usuário, senha ou URL completa;
- não cria venda, não consome crédito e não altera cliente durante a homologação.
