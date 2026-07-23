# Roneca Smart TV Core

Núcleo compartilhado e independente de plataforma para as futuras versões LG webOS e Samsung Tizen do RonecaPlayTV.

## Regra principal

O aplicativo Android nativo é a fonte única de verdade de produto e de aparência. Nenhuma implementação webOS ou Tizen pode inventar uma identidade própria, reaproveitar o visual legado do antigo aplicativo React ou alterar a ordem de foco.

A meta de paridade é visual e comportamental:

- mesmas telas, hierarquia, textos e estados;
- mesmas cores, proporções, raios, espaçamentos e grades;
- mesmos destaques de foco e caminhos do controle remoto;
- mesmas regras de pesquisa, temporadas, episódios, favoritos, retomada e progresso;
- mesmo cabeçalho e organização do player, usando o motor nativo de cada plataforma.

## Limites do núcleo

O núcleo não renderiza interface e não reproduz vídeo diretamente. Ele contém:

- modelos de catálogo;
- busca e filtros;
- regras de séries e temporadas;
- progresso e retomada;
- navegação semântica e restauração de foco;
- contratos de ativação, armazenamento e player;
- contrato visual versionado extraído do Android.

Cada aplicativo implementará adaptadores próprios:

```text
Android       -> Compose + Media3 + AndroidKeyStore
LG webOS      -> interface web + player webOS + armazenamento webOS
Samsung Tizen -> interface web + AVPlay + armazenamento Tizen
```

## Estrutura

```text
smart-tv-core/
├── src/
│   ├── catalog.ts
│   ├── design.ts
│   ├── navigation.ts
│   ├── platform.ts
│   ├── progress.ts
│   ├── search.ts
│   ├── series.ts
│   └── index.ts
└── tests/
```

## Política de paridade

Uma mudança visual no Android somente passa a valer nas outras plataformas depois que o contrato `nativeVisualContract` for atualizado e os testes de paridade forem aprovados. webOS e Tizen não devem possuir valores visuais soltos fora desse contrato, exceto correções documentadas para diferenças de escala física entre modelos de televisão.
