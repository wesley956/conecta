package com.ronecaplaytv.nativeapp.update

data class UpdateManifest(
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val mandatory: Boolean,
    notes: String,
) {
    val notes: String = compactUpdateNotes(notes)
}

sealed interface AppUpdateState {
    data object Idle : AppUpdateState

    data class Checking(
        val userInitiated: Boolean,
    ) : AppUpdateState

    data class UpToDate(
        val userInitiated: Boolean,
    ) : AppUpdateState

    data class Available(
        val manifest: UpdateManifest,
    ) : AppUpdateState

    data class Downloading(
        val manifest: UpdateManifest,
        val progress: Float?,
    ) : AppUpdateState

    data class ReadyToInstall(
        val manifest: UpdateManifest,
        val apkPath: String,
        val permissionRequired: Boolean = false,
    ) : AppUpdateState

    data class Error(
        val message: String,
        val userVisible: Boolean,
    ) : AppUpdateState
}

private fun compactUpdateNotes(rawNotes: String): String {
    val contentLines = rawNotes
        .lineSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .filterNot { line -> line.startsWith("#") }
        .toList()

    val introduction = contentLines
        .firstOrNull { line -> !line.isUpdateBullet() }
        ?.cleanUpdateLine()
        ?.take(MAX_UPDATE_INTRO_LENGTH)

    val bulletItems = contentLines
        .asSequence()
        .filter(String::isUpdateBullet)
        .map(String::cleanUpdateLine)
        .filter(String::isNotBlank)
        .distinct()
        .take(MAX_UPDATE_ITEMS)
        .toList()

    val fallbackItems = if (bulletItems.isNotEmpty()) {
        bulletItems
    } else {
        contentLines
            .asSequence()
            .filter { line -> line != introduction }
            .map(String::cleanUpdateLine)
            .filter(String::isNotBlank)
            .distinct()
            .take(MAX_UPDATE_ITEMS)
            .toList()
    }

    return buildList {
        introduction?.takeIf(String::isNotBlank)?.let(::add)
        fallbackItems.forEach { item ->
            add("• ${item.take(MAX_UPDATE_ITEM_LENGTH)}")
        }
    }.joinToString("\n").ifBlank { "Nova versão disponível." }
}

private fun String.isUpdateBullet(): Boolean =
    startsWith("-") || startsWith("*") || startsWith("•")

private fun String.cleanUpdateLine(): String =
    trimStart('-', '*', '•', ' ')
        .trim()
        .trimEnd(';')

private const val MAX_UPDATE_ITEMS = 3
private const val MAX_UPDATE_INTRO_LENGTH = 120
private const val MAX_UPDATE_ITEM_LENGTH = 92
