# ronecaPlayer TV — LG webOS e Samsung Tizen

Base compartilhada das versões para Smart TV. A versão Android é a referência
visual e comportamental obrigatória.

## Princípios

- uma única interface React/TypeScript para LG e Samsung;
- adaptadores de player e ciclo de vida separados por plataforma;
- navegação completa por controle remoto;
- foco dourado/vermelho visível e previsível;
- layout, cores, cards e hierarquia equivalentes ao Android;
- nenhuma chave privada empacotada no aplicativo.

## Desenvolvimento

```bash
npm install
npm run typecheck
npm run build
```

O navegador é usado apenas para desenvolvimento. O produto final será
empacotado como `.ipk` para webOS e `.wgt` para Tizen.

## Ativação compartilhada

LG e Samsung usam o mesmo cadastro de aparelhos do Android:

- a instalação cria uma identidade aleatória persistente;
- `device-activate` gera o código e a credencial individual;
- somente o hash da credencial fica no banco;
- `device-config` valida código, identidade e credencial antes de liberar;
- o aplicativo consulta automaticamente a liberação a cada 15 segundos;
- nenhuma chave privada é empacotada no aplicativo.

O shell visual, a detecção de plataforma, a navegação por controle e a ativação
estão implementados. Catálogo, player, splash sonora e empacotamento assinado
entram nos próximos marcos.
