# LG 2.9.8 — Pacote 2 (#295, #296, #297)

## #295 — ativação e suporte

- `supportProfile` compartilhado com Android é consumido na ativação e após o vínculo;
- hierarquia vendedor/sistema/genérico continua resolvida pelo backend;
- cliente rejeita URL não HTTPS, URL com credenciais, WhatsApp/e-mail inválidos e textos acima dos limites;
- ativação FHD usa código e suporte em áreas laterais independentes;
- Configurações identifica o responsável, contato, horário e código técnico;
- QR Code local permanece gate aberto: não será substituído por serviço externo que receba o contato do usuário.

## #296 — categorias

- preferência persistente: `Clássica` ou `Painel lateral`;
- Clássica preserva chips/faixa existentes;
- Painel lateral ocupa 18%, mantém contagens e diferencia foco de seleção;
- Canais inclui Todos, Favoritos, A-Z e grupos;
- Filmes/Séries incluem filtros comerciais e categorias;
- menu principal fica fora da composição durante o catálogo;
- esquerda/Back abre o menu; Back novamente retorna ao painel; direita entra no catálogo;
- seleção de destino fecha o menu sobreposto.

## #297 — legendas

- rótulo seguro usa label, idioma ou fallback enumerado;
- painel abre focado na faixa efetivamente ativa;
- `Desativadas` é uma opção real;
- seleção é marcada independentemente do foco vermelho;
- escolher faixa ou desativar fecha apenas o painel;
- Back fecha o painel antes de sair do player;
- ausência de faixa continua não bloqueando a reprodução.

## Gates físicos

- QR Code local e escaneável sem terceiro;
- D-pad/Back em todas as bordas do painel lateral;
- listas com centenas de categorias;
- WebVTT/text track e áudio alternativo reais em TV LG;
- persistência após reboot e atualização 1.0.0 → 1.1.0.
