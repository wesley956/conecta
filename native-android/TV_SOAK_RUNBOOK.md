# Teste de estabilidade em Android TV

Use uma TV de baixa memória com o APK de release instalado. Abra um canal ao vivo,
altere de canal algumas vezes, deixe a reprodução ativa e execute na estação com ADB:

```bash
./scripts/android-tv-soak.sh 60 > android-tv-soak.csv
```

Durante a hora, envie o app ao segundo plano e retorne ao menos duas vezes. O teste é
aprovado quando não há encerramento do processo, a reprodução volta na posição
esperada, o controle remoto continua responsivo e PSS/RSS não apresentam crescimento
contínuo sem estabilização. Para diagnóstico local sem credenciais:

```bash
adb logcat -s RonecaDiagnostics
```

Anexe o CSV e o trecho de logcat ao release candidate. Nunca anexe `dumpsys` completo,
URLs de listas ou respostas do fornecedor.
