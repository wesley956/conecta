# RonecaPlayTV

Aplicativo IPTV/P2P legal com interface para Android, TV Box, Android TV e painel administrativo.

## Estado atual

Este repositório contém o protótipo inicial do RonecaPlayTV, criado a partir da especificação do sistema:

- React + Vite + TypeScript
- Tailwind CSS
- Zustand
- hls.js preparado para futura tela de player
- Layout escuro neon para celular, TV Box e Android TV
- Telas de Splash, Ativação, Home, Canais, Filmes, Séries, Favoritos, Busca, Listas, Configurações e Admin demo

## Aviso legal

O RonecaPlayTV deve funcionar apenas como player e gerenciador de acesso para listas e fontes autorizadas. O projeto não deve incluir canais, filmes, séries, listas piratas, bypass de DRM, scraping de conteúdo pago ou qualquer mecanismo de violação de direitos autorais.

## Como rodar

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Próximas fases

1. Corrigir TypeScript e criar `npm run verify`.
2. Implementar PlayerScreen real com hls.js.
3. Implementar parser M3U legal/autorizado.
4. Persistir favoritos, histórico e configurações.
5. Adicionar Capacitor para gerar APK Android.
6. Criar backend real para clientes, dispositivos, planos e vencimentos.
