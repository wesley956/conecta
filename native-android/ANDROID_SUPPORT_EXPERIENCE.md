# Ativação e suporte no Android

Escopo das Issues #276 e #277, derivadas da MASTER #266.

## Contrato e segurança

- O Android consome somente o `supportProfile` já resolvido pelo backend.
- O aplicativo não consulta vendedor, não infere vínculo comercial e não mantém cache separado de suporte.
- A prioridade vendedor → sistema → genérico continua no backend.
- O cliente aceita apenas URL HTTPS sem credenciais, WhatsApp normalizado ou e-mail válido.
- Falha ao abrir um aplicativo externo copia o contato como alternativa e não bloqueia ativação ou uso.
- O QR é gerado em tempo de execução, preto preenchido sobre branco, com margem de leitura e sem link gravado no APK.

## Larguras

| Classe | Regra | Ativação | Suporte |
|---|---:|---|---|
| Compacta | `< 600dp` | coluna rolável | botão/link, sem QR grande |
| Média | `600–839dp` | coluna rolável | QR e botão |
| Expandida | `>= 840dp`, ou TV quando couber | código e ajuda em duas colunas | QR prioritário |

Na TV, a ordem natural de foco começa em **Copiar**, segue para **Compartilhar**, **Abrir suporte**, **Atualizar** e, quando aplicável, **Reiniciar**. O QR não recebe foco. Em Configurações, `Back` fecha o diálogo de suporte sem sair da tela.

## Matriz de homologação

Homologação física pendente para o APK final:

- telefone compacto em retrato e paisagem;
- tablet nas faixas média e expandida;
- Android TV 720p e 1080p com controle remoto;
- perfis resolvidos de vendedor, sistema e genérico;
- atualização do perfil sem reinstalação;
- ausência de handler para link/e-mail, com cópia alternativa;
- leitura do QR em câmera física e em diferentes distâncias da TV.

Nenhuma função Supabase ou migração de produção é implantada por este bloco.
