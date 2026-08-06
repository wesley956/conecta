from pathlib import Path

path = Path('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt')
text = path.read_text()

old_call = 'if (catalog.progressive) scheduleProgressiveHydration(candidate)'
count = text.count(old_call)
if count != 2:
    raise SystemExit(f'expected 2 progressive hydration calls, found {count}')
text = text.replace(
    old_call,
    'if (catalog.progressive) scheduleProgressiveHydration(catalog.progressiveCandidate ?: candidate)',
)

old_return = """                    warning = "Canais carregados. Filmes e séries continuam em segundo plano.",
                    progressive = true,
                )"""
new_return = """                    warning = "Canais carregados. Filmes e séries continuam em segundo plano.",
                    progressive = true,
                    progressiveCandidate = candidate,
                )"""
if old_return not in text:
    raise SystemExit('fast Xtream LoadedCatalog anchor missing')
text = text.replace(old_return, new_return, 1)

old_model = """        val warning: String? = null,
        val progressive: Boolean = false,
    ) {"""
new_model = """        val warning: String? = null,
        val progressive: Boolean = false,
        val progressiveCandidate: DevicePlaylistConfig? = null,
    ) {"""
if old_model not in text:
    raise SystemExit('LoadedCatalog model anchor missing')
text = text.replace(old_model, new_model, 1)

path.write_text(text)
