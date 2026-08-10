package com.ronecaplaytv.nativeapp.ui.player

enum class PlayerAspectMode(
    val storageValue: String,
    val displayName: String,
) {
    Original("Original", "Original"),
    Fill("Preencher", "Preencher"),
    Stretch("Estender", "Estender"),
    ;

    fun next(): PlayerAspectMode {
        val values = entries
        return values[(ordinal + 1) % values.size]
    }

    companion object {
        fun fromStorage(value: String?): PlayerAspectMode = entries.firstOrNull {
            it.storageValue.equals(value?.trim(), ignoreCase = true) ||
                it.name.equals(value?.trim(), ignoreCase = true)
        } ?: when (value?.trim()) {
            "Ajustar largura", "Ajustar altura" -> Original
            else -> Original
        }

        val settingsOptions: List<String> = entries.map(PlayerAspectMode::storageValue)
    }
}
