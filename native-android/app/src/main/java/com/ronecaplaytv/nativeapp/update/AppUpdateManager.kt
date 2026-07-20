package com.ronecaplaytv.nativeapp.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.ronecaplaytv.nativeapp.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale

class AppUpdateManager(private val context: Context) {
    suspend fun fetchManifest(): UpdateManifest = withContext(Dispatchers.IO) {
        val connection = openHttpsConnection(URL(BuildConfig.UPDATE_MANIFEST_URL))
        try {
            if (connection.responseCode !in 200..299) {
                throw AppUpdateException("Não foi possível consultar a versão mais recente.")
            }

            val body = connection.inputStream.use { input ->
                readLimited(input, MAX_MANIFEST_BYTES).toString(Charsets.UTF_8.name())
            }
            parseManifest(JSONObject(body))
        } finally {
            connection.disconnect()
        }
    }

    suspend fun download(
        manifest: UpdateManifest,
        onProgress: (Float?) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val connection = openHttpsConnection(URL(manifest.apkUrl), readTimeoutMs = DOWNLOAD_TIMEOUT_MS)
        val updateDirectory = File(context.cacheDir, UPDATE_DIRECTORY).apply { mkdirs() }
        val partialFile = File(updateDirectory, "ronecaPlayerTV-${manifest.versionName}.apk.part")
        val finalFile = File(updateDirectory, "ronecaPlayerTV-${manifest.versionName}.apk")

        partialFile.delete()
        finalFile.delete()

        try {
            if (connection.responseCode !in 200..299) {
                throw AppUpdateException("O APK da atualização não está disponível.")
            }

            val expectedBytes = connection.getHeaderField("Content-Length")
                ?.toLongOrNull()
                ?.takeIf { it > 0L }
            if (expectedBytes != null && expectedBytes > MAX_APK_BYTES) {
                throw AppUpdateException("O APK excede o tamanho máximo permitido.")
            }

            connection.inputStream.use { input ->
                FileOutputStream(partialFile).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var downloaded = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        downloaded += count
                        if (downloaded > MAX_APK_BYTES) {
                            throw AppUpdateException("O APK excede o tamanho máximo permitido.")
                        }
                        output.write(buffer, 0, count)
                        onProgress(expectedBytes?.let { (downloaded.toFloat() / it).coerceIn(0f, 1f) })
                    }
                    output.fd.sync()
                }
            }

            verifyChecksum(partialFile, manifest.sha256)
            verifyPackageAndSignature(partialFile, manifest.versionCode)

            if (!partialFile.renameTo(finalFile)) {
                throw AppUpdateException("Não foi possível preparar o APK para instalação.")
            }
            finalFile
        } catch (error: Exception) {
            partialFile.delete()
            finalFile.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }

    fun requestInstall(apk: File): InstallRequestResult {
        if (!apk.isFile) {
            throw AppUpdateException("O arquivo da atualização não foi encontrado.")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val permissionIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(permissionIntent)
            return InstallRequestResult.PermissionRequired
        }

        val apkUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apk,
        )
        val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(apkUri, APK_MIME_TYPE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
        }
        context.startActivity(installIntent)
        return InstallRequestResult.InstallerOpened
    }

    private fun parseManifest(json: JSONObject): UpdateManifest {
        val versionCode = json.optLong("versionCode", -1L)
        val versionName = json.optString("versionName").trim()
        val apkUrl = json.optString("apkUrl").trim()
        val sha256 = json.optString("sha256").trim().lowercase(Locale.US)
        val notes = json.optString("notes", "Nova versão disponível.").trim().take(MAX_NOTES_LENGTH)

        if (versionCode <= 0L || versionName.isBlank()) {
            throw AppUpdateException("O servidor retornou uma versão inválida.")
        }
        validateHttpsUrl(URL(apkUrl))
        if (!SHA256_PATTERN.matches(sha256)) {
            throw AppUpdateException("O checksum da atualização é inválido.")
        }

        return UpdateManifest(
            versionCode = versionCode,
            versionName = versionName,
            apkUrl = apkUrl,
            sha256 = sha256,
            mandatory = json.optBoolean("mandatory", false),
            notes = notes.ifBlank { "Nova versão disponível." },
        )
    }

    private fun openHttpsConnection(
        initialUrl: URL,
        readTimeoutMs: Int = DEFAULT_READ_TIMEOUT_MS,
    ): HttpURLConnection {
        var currentUrl = initialUrl
        repeat(MAX_REDIRECTS + 1) { redirectCount ->
            validateHttpsUrl(currentUrl)
            val connection = (currentUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = readTimeoutMs
                instanceFollowRedirects = false
                setRequestProperty("Accept", "application/json, application/vnd.android.package-archive, application/octet-stream")
                setRequestProperty("Cache-Control", "no-cache")
                setRequestProperty("User-Agent", "ronecaPlayerTV/${BuildConfig.VERSION_NAME}")
            }

            val status = connection.responseCode
            if (status !in REDIRECT_STATUS_CODES) return connection
            if (redirectCount == MAX_REDIRECTS) {
                connection.disconnect()
                throw AppUpdateException("A atualização excedeu o limite de redirecionamentos.")
            }

            val location = connection.getHeaderField("Location")
            connection.disconnect()
            if (location.isNullOrBlank()) {
                throw AppUpdateException("O servidor retornou um redirecionamento inválido.")
            }
            currentUrl = URL(currentUrl, location)
        }
        throw AppUpdateException("Não foi possível acessar o servidor de atualização.")
    }

    private fun validateHttpsUrl(url: URL) {
        if (url.protocol != "https" || url.host.lowercase(Locale.US) !in ALLOWED_UPDATE_HOSTS) {
            throw AppUpdateException("O endereço da atualização não é permitido.")
        }
    }

    private fun verifyChecksum(file: File, expectedSha256: String) {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        val actual = digest.digest().joinToString("") { byte -> "%02x".format(byte) }
        if (!actual.equals(expectedSha256, ignoreCase = true)) {
            throw AppUpdateException("A verificação de segurança do APK falhou.")
        }
    }

    private fun verifyPackageAndSignature(apk: File, expectedVersionCode: Long) {
        val packageManager = context.packageManager
        val archiveInfo = packageInfoFromArchive(packageManager, apk)
            ?: throw AppUpdateException("O arquivo baixado não é um APK válido.")
        if (archiveInfo.packageName != BuildConfig.APPLICATION_ID) {
            throw AppUpdateException("O APK pertence a outro aplicativo.")
        }
        if (archiveInfo.versionCodeCompat() != expectedVersionCode || expectedVersionCode <= BuildConfig.VERSION_CODE) {
            throw AppUpdateException("A versão do APK não corresponde à atualização anunciada.")
        }

        val installedCertificates = installedPackageInfo(packageManager).signingCertificateDigests()
        val archiveCertificates = archiveInfo.signingCertificateDigests()

        // Alguns firmwares de Android TV não expõem os certificados de APKs ainda não
        // instalados pelo PackageManager. Quando ambos os lados puderem ser lidos,
        // fazemos a comparação antecipada. Caso contrário, checksum, pacote e versão
        // continuam validados aqui e o instalador do próprio Android faz a verificação
        // criptográfica obrigatória antes de substituir o aplicativo instalado.
        if (
            installedCertificates.isNotEmpty() &&
            archiveCertificates.isNotEmpty() &&
            installedCertificates.intersect(archiveCertificates).isEmpty()
        ) {
            throw AppUpdateException("A assinatura do APK não corresponde à assinatura do aplicativo instalado.")
        }
    }

    @Suppress("DEPRECATION")
    private fun packageInfoFromArchive(packageManager: PackageManager, apk: File): PackageInfo? {
        val flags = PackageManager.GET_SIGNING_CERTIFICATES or PackageManager.GET_SIGNATURES
        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageArchiveInfo(
                apk.absolutePath,
                PackageManager.PackageInfoFlags.of(flags.toLong()),
            )
        } else {
            packageManager.getPackageArchiveInfo(apk.absolutePath, flags)
        }

        packageInfo?.applicationInfo?.apply {
            sourceDir = apk.absolutePath
            publicSourceDir = apk.absolutePath
        }
        return packageInfo
    }

    @Suppress("DEPRECATION")
    private fun installedPackageInfo(packageManager: PackageManager): PackageInfo {
        val flags = PackageManager.GET_SIGNING_CERTIFICATES or PackageManager.GET_SIGNATURES
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageInfo(
                context.packageName,
                PackageManager.PackageInfoFlags.of(flags.toLong()),
            )
        } else {
            packageManager.getPackageInfo(context.packageName, flags)
        }
    }

    @Suppress("DEPRECATION")
    private fun PackageInfo.versionCodeCompat(): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) longVersionCode else versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun PackageInfo.signingCertificateDigests(): Set<String> {
        val certificateSignatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val currentSigners = signingInfo?.apkContentsSigners.orEmpty()
            val signingHistory = signingInfo?.signingCertificateHistory.orEmpty()
            val modernSigners = (currentSigners + signingHistory).distinctBy { it.toCharsString() }
            modernSigners.ifEmpty { signatures.orEmpty().toList() }
        } else {
            signatures.orEmpty().toList()
        }

        return certificateSignatures.mapTo(mutableSetOf()) { signature ->
            MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
                .joinToString("") { byte -> "%02x".format(byte) }
        }
    }

    private fun readLimited(input: InputStream, maxBytes: Int): ByteArrayOutputStream {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > maxBytes) throw AppUpdateException("A resposta do servidor é muito grande.")
            output.write(buffer, 0, count)
        }
        return output
    }

    enum class InstallRequestResult {
        PermissionRequired,
        InstallerOpened,
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 12_000
        const val DEFAULT_READ_TIMEOUT_MS = 20_000
        const val DOWNLOAD_TIMEOUT_MS = 180_000
        const val MAX_REDIRECTS = 5
        const val MAX_MANIFEST_BYTES = 64 * 1024
        const val MAX_APK_BYTES = 250L * 1024L * 1024L
        const val MAX_NOTES_LENGTH = 2_000
        const val UPDATE_DIRECTORY = "updates"
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"

        val SHA256_PATTERN = Regex("^[a-f0-9]{64}$")
        val REDIRECT_STATUS_CODES = setOf(301, 302, 303, 307, 308)
        val ALLOWED_UPDATE_HOSTS = setOf(
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
            "objects-origin.githubusercontent.com",
        )
    }
}

class AppUpdateException(
    override val message: String,
) : Exception(message)
