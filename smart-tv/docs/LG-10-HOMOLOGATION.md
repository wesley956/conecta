# LG-10 — Homologação final APK × IPK

## Regra central

**BUILD ONCE → TEST EXACT ARTIFACT → PROMOTE SAME ARTIFACT**

A homologação física deve usar exatamente o IPK e o SHA-256 gerados pelo workflow oficial. Depois de aprovado, **não reconstruir** a mesma release para publicar. Qualquer alteração de bytes exige um novo candidate/RC e nova evidência.

Stable permanece bloqueado até aprovação física e promoção explícita pela política LG-P07.

## Identidade da referência

- Android de referência: RonecaPlayTV 2.9.5.
- LG App ID: `com.ronecaplaytv.app`.
- O arquivo `artifacts/lg10-homologation-manifest.json` é a ficha técnica do RC produzido pelo CI.
- O arquivo `artifacts/SHA256SUMS` é a referência de integridade do IPK.

## Antes de instalar

1. Baixar o artifact `roneca-play-tv-lg-ipk` do workflow LG do commit aprovado.
2. Conferir `lg10-homologation-manifest.json`.
3. Conferir `SHA256SUMS`.
4. Calcular novamente SHA-256 localmente e comparar.
5. Registrar modelo da TV, versão webOS, data, tester e conexão usada.
6. Não renomear/reempacotar/reconstruir o IPK.

## Instalação limpa

Com Developer Mode e a TV configurada na CLI:

```bash
ares-install --device-list
ares-install --device <TV> --list --type web
ares-install --device <TV> -v <IPK_EXATO>
ares-launch --device <TV> com.ronecaplaytv.app
```

Registrar:
- saída do `ares-install`;
- saída do `ares-launch`;
- primeira tela útil;
- ativação;
- segunda abertura sem reinstalar.

Depois desligar/reiniciar a TV e abrir novamente o app.

## Atualização N→N+1

O teste **N→N+1** deve usar uma versão anterior realmente instalada e o RC exato como atualização.

Antes da atualização, registrar:
- código/identidade do aparelho;
- favoritos;
- item com progresso VOD;
- temporada/episódio em uso quando aplicável;
- preferências de player/aspecto/buffer.

Após atualizar, verificar os mesmos itens. Uma atualização que cria um novo dispositivo, perde identidade essencial ou apaga favoritos/progresso/preferences sem regra explícita falha o gate.

## Fluxos funcionais obrigatórios

Executar no LG e, quando aplicável, repetir lado a lado no Android 2.9.5:

1. Splash/abertura.
2. Ativação.
3. Home.
4. Busca.
5. Canais e categorias.
6. Filmes e detalhe.
7. Séries, temporadas e episódios.
8. Favoritos e Continuar Assistindo.
9. Player Live.
10. Player VOD.
11. Áudio/legendas.
12. Aspecto Original/Preencher/Estender.
13. Seek ±10 s.
14. EPG.
15. Configurações.
16. Diagnóstico e código de suporte.
17. Atualizar conteúdo versus verificar atualização do aplicativo.
18. Limpar cache reconstruível.
19. Queda e retorno da internet.
20. Origem incompatível/indisponível → source switch.
21. Lista principal falhando → reserva.
22. Standby/resume.
23. Reinício completo da TV.

## Performance física LG-09 dentro da homologação

Na TV mais antiga disponível, preferencialmente webOS 4.x:

- navegar Home/Canais/Filmes/Séries/Busca por **30 minutos**;
- executar pelo menos **20 ciclos** Live/VOD de abrir → reproduzir → sair;
- observar CPU/memória com Resource Monitor/`ares-device`;
- confirmar que a memória não cresce continuamente sem estabilização;
- confirmar que não permanecem múltiplos `<video>`/players antigos;
- validar catálogo grande e série com muitos episódios;
- validar D-pad sem travamento perceptível.

## Paridade APK × IPK

Preencher `LG-10-PARITY-MATRIX.md`.

Classificações aceitas:
- A — praticamente idêntico;
- B — equivalente com diferença justificada pela plataforma;
- C — divergente e precisa correção;
- N/A — não aplicável, com justificativa.

Nenhum **C crítico** pode permanecer na aprovação final.

## Evidência mínima por TV

Criar uma pasta/registro de evidência identificada pelo SHA do RC contendo:
- modelo da TV;
- versão webOS;
- SHA-256 do IPK;
- commit do RC;
- data/hora;
- resultado de install/launch/reboot/upgrade;
- fotos ou vídeo dos fluxos principais;
- logs relevantes sanitizados;
- medições de CPU/memória;
- matriz APK × IPK preenchida;
- lista de diferenças A/B/C/N/A.

## Decisão final

O RC só pode ser marcado como apto à promoção quando:
- instalação limpa passou;
- segunda abertura e reboot passaram;
- N→N+1 passou;
- preservação de estado essencial passou;
- fluxos críticos passaram;
- LG-01→LG-09 foram fisicamente cobertos ou formalmente aceitos;
- matriz APK × IPK não contém C crítico;
- performance física não apresenta crescimento contínuo de recursos;
- versão/commit/hash/evidências estão congelados.

Até isso acontecer, o estado correto é **RC_PENDING_PHYSICAL** e `stableEligible=false`.
