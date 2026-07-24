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

## Situação deste marco

Este primeiro marco entrega o shell visual, a detecção de plataforma e a
navegação espacial por setas. Ativação, catálogo, player e empacotamento
assinado entram nos próximos marcos, reutilizando as APIs já existentes.
