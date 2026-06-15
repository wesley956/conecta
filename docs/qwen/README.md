# RonecaPlayTV - Documentação do Projeto

## Visão Geral

RonecaPlayTV é um player IPTV/P2P legal desenvolvido para Android (celular, tablet, TV Box, Android TV, Google TV) com painel administrativo web.

**IMPORTANTE:** Este aplicativo é um player de mídia para conteúdo **AUTORIZADO**. Não fornece, distribui ou promove conteúdo pirata.

## Estrutura do Projeto

```
ronecaplaytv/
├── src/
│   ├── components/       # Componentes reutilizáveis
│   ├── screens/          # Telas principais
│   ├── layouts/          # Layouts (TV e Mobile)
│   ├── store/            # Gerenciamento de estado (Zustand)
│   ├── types/            # Definições TypeScript
│   ├── styles/           # Estilos e tema
│   ├── data/             # Dados mockados para demo
│   ├── utils/            # Funções utilitárias
│   ├── App.tsx           # Componente principal
│   ├── main.tsx          # Ponto de entrada
│   └── index.css         # Estilos globais
├── docs/                 # Documentação
├── public/               # Assets estáticos
├── index.html            # HTML principal
├── package.json          # Dependências
├── vite.config.ts        # Configuração Vite
└── tsconfig.json         # Configuração TypeScript
```

## Stack Tecnológico

- **Frontend:** React 19 + Vite + TypeScript
- **Estilização:** Tailwind CSS 4
- **Estado:** Zustand
- **Ícones:** Lucide React
- **Player:** HLS.js (para streams HLS)
- **Mobile/TV:** Capacitor (para build Android)

## Cores do Tema

- **Fundo Principal:** `#050B0F`
- **Fundo Secundário:** `#07131A`
- **Card:** `#111C24`
- **Borda:** `#253541`
- **Laranja Neon:** `#FF7A1A`
- **Ciano Neon:** `#00E6E6`
- **Verde Ativo:** `#31D67B`
- **Amarelo Alerta:** `#FFD447`
- **Vermelho Erro:** `#FF4D4D`

## Funcionalidades Implementadas (Fase 1)

### ✅ Concluído

1. **Splash Screen**
   - Animação de carregamento
   - Verificação de conexão
   - Verificação de dispositivo
   - Verificação de assinatura

2. **Tela de Ativação**
   - Exibição do código do dispositivo
   - Solicitação de acesso
   - Status de ativação

3. **Home Screen**
   - Cards de navegação principais
   - Seção "Continuar Assistindo"
   - Categorias populares
   - Informações de assinatura

4. **Tela de Configurações**
   - Configurações de player
   - Configurações P2P
   - Idioma
   - Assinatura
   - Aparência
   - Armazenamento
   - Sobre

5. **Tela de Listas**
   - Visualização de playlists
   - Adicionar nova lista
   - Testar lista
   - Ativar/desativar lista

6. **Layouts**
   - TV Layout (controle remoto)
   - Mobile Layout (toque)
   - Navegação por foco

7. **Sistema de Estado**
   - Zustand store
   - Persistência local
   - Gerenciamento de dispositivo

## Próximas Fases

### Fase 2 — IPTV Básico
- [ ] Importação M3U
- [ ] Parser M3U
- [ ] Listagem de canais
- [ ] Categorias
- [ ] Player HLS
- [ ] Favoritos
- [ ] Busca

### Fase 3 — Assinatura Mensal
- [ ] Painel admin web
- [ ] Clientes
- [ ] Dispositivos
- [ ] Planos
- [ ] Vencimentos
- [ ] Liberação por dispositivo
- [ ] Bloqueio automático

### Fase 4 — Filmes e Séries
- [ ] VOD completo
- [ ] Categorias
- [ ] Detalhes
- [ ] Temporadas e episódios
- [ ] Continuar assistindo
- [ ] Progresso

### Fase 5 — EPG
- [ ] Importar XMLTV
- [ ] Associar EPG aos canais
- [ ] Mostrar programa atual
- [ ] Próximos horários

### Fase 6 — P2P Autorizado
- [ ] Configuração P2P
- [ ] Cache
- [ ] Limite de upload
- [ ] Modo Wi-Fi
- [ ] Status de conexão

### Fase 7 — APK Final
- [ ] Ícone do app
- [ ] Splash nativa
- [ ] Build Android
- [ ] Manifest para TV
- [ ] Testes em dispositivos

## Comandos

### Desenvolvimento
```bash
npm install          # Instalar dependências
npm run dev          # Iniciar servidor de desenvolvimento
npm run build        # Build para produção
npm run preview      # Preview da build
```

### Android (Capacitor)
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init RonecaPlayTV com.ronecaplaytv.app
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

## Uso

1. **Primeiro Acesso:**
   - Instale o app
   - Anote o código do dispositivo
   - Envie para o administrador
   - Aguarde liberação
   - Clique em "Tentar Novamente"

2. **Navegação TV:**
   - Setas: Navegar entre itens
   - OK/Enter: Selecionar
   - Voltar: Retornar tela anterior

3. **Navegação Mobile:**
   - Toque: Selecionar itens
   - Menu inferior: Navegação principal

## Aviso Legal

Este aplicativo é um player de mídia. O usuário é responsável por:
- Adicionar apenas listas autorizadas
- Possuir direitos para o conteúdo reproduzido
- Cumprir leis de direitos autorais

O uso para conteúdo pirata é proibido.

## Suporte

Para questões técnicas e suporte, entre em contato com o administrador do provedor.

---

**Versão:** 1.0.0  
**Desenvolvido por:** RonecaPlayTV Team  
**Licença:** Proprietária
