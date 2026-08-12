package com.ronecaplaytv.nativeapp.ui.settings

enum class CategoryDisplayMode(
    val storageValue: String,
    val label: String,
) {
    Classic(storageValue = "classic", label = "Clássica"),
    SidePanel(storageValue = "side_panel", label = "Painel lateral"),
    ;

    companion object {
        fun fromStorage(value: String?): CategoryDisplayMode =
            entries.firstOrNull { it.storageValue == value } ?: Classic

        fun fromLabel(value: String): CategoryDisplayMode =
            entries.firstOrNull { it.label == value } ?: Classic
    }
}
