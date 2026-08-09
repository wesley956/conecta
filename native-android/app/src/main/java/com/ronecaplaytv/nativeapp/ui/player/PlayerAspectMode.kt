package com.ronecaplaytv.nativeapp.ui.player

enum class PlayerAspectMode(
    val storageValue: String,
    val displayName: String,
) {
    Original("Original", "Original"),
    Fill("Preencher", "Preencher"),
    Stretch("Estender", "Estender"),
    FixedWidth("Ajustar largura", "Largura"),
    FixedHeight("Ajustar altura", "Altura"),
    ;

    fun next(): PlayerAspectMode {
        val values = entries
        return values[(ordinal + 1) % values.size]
    }

    companion object {
        fun fromStorage(value: String?): PlayerAspectMode = entries.firstOrNull {
            it.storageValue.equals(value?.trim(), ignoreCase = true) ||
                it.name.equals(value?.trim(), ignoreCase = true)
        } ?: Original

        val settingsOptions: List<String> = entries.map(PlayerAspectMode::storageValue)
    }
}
