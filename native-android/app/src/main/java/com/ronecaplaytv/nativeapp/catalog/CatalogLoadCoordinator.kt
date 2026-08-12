package com.ronecaplaytv.nativeapp.catalog

/**
 * Gera tokens monotônicos para que apenas a carga mais recente publique estado.
 * O cancelamento do Job continua sendo a primeira defesa; o token cobre clientes
 * que demorem a observar o cancelamento e retornem depois de uma configuração nova.
 */
internal class CatalogLoadCoordinator {
    @Volatile
    private var currentGeneration = 0L

    @Synchronized
    fun begin(): Long {
        currentGeneration += 1L
        return currentGeneration
    }

    fun isCurrent(generation: Long): Boolean = generation == currentGeneration
}
