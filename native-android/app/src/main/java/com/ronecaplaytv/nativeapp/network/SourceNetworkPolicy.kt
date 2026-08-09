package com.ronecaplaytv.nativeapp.network

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.URL
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** Escopos independentes definidos no painel para uma fonte. */
enum class SourceNetworkScope {
    Catalog,
    Playback,
}

data class SourceNetworkPolicy(
    val tlsMode: String = TLS_STRICT,
    val allowedHosts: Set<String> = emptySet(),
    val allowSubdomains: Boolean = false,
    val allowRedirectHosts: Boolean = false,
    val catalogAllowed: Boolean = true,
    val playbackAllowed: Boolean = true,
    val customCaPem: String? = null,
    val requestHeaders: Map<String, String> = emptyMap(),
    val followRedirects: Boolean = true,
    val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
) {
    val normalizedTlsMode: String
        get() = tlsMode.lowercase(Locale.ROOT).takeIf {
            it == TLS_STRICT || it == TLS_CUSTOM_CA || it == TLS_INSECURE
        } ?: TLS_STRICT

    fun appliesTo(scope: SourceNetworkScope): Boolean = when (scope) {
        SourceNetworkScope.Catalog -> catalogAllowed
        SourceNetworkScope.Playback -> playbackAllowed
    }

    fun isHostAllowed(rawHost: String?): Boolean {
        val host = normalizeHost(rawHost ?: return false)
        if (host.isBlank()) return false
        return allowedHosts.any { raw ->
            val candidate = normalizeHost(raw.substringBefore(':'))
            candidate.isNotBlank() && (
                host == candidate || (allowSubdomains && host.endsWith(".$candidate"))
            )
        }
    }

    val cacheKey: String
        get() = listOf(
            normalizedTlsMode,
            allowedHosts.sorted().joinToString(","),
            allowSubdomains,
            allowRedirectHosts,
            catalogAllowed,
            playbackAllowed,
            customCaPem?.hashCode() ?: 0,
            requestHeaders.toSortedMap().hashCode(),
            followRedirects,
            timeoutMs,
        ).joinToString("|")

    companion object {
        const val TLS_STRICT = "strict"
        const val TLS_CUSTOM_CA = "custom_ca"
        const val TLS_INSECURE = "insecure"
        const val DEFAULT_TIMEOUT_MS = 45_000

        fun strict() = SourceNetworkPolicy()

        fun fromJson(json: JSONObject?): SourceNetworkPolicy {
            if (json == null) return strict()
            val scopes = json.optJSONObject("scopes")
            val hosts = buildSet {
                val values = json.optJSONArray("allowedHosts")
                if (values != null) {
                    for (index in 0 until values.length()) {
                        normalizeHost(values.optString(index)).takeIf(String::isNotBlank)?.let(::add)
                    }
                }
            }
            val headers = buildMap {
                val values = json.optJSONObject("requestHeaders")
                if (values != null) {
                    values.keys().forEach { name ->
                        val normalizedName = name.trim()
                        val value = values.optString(name).trim()
                        if (isAllowedHeader(normalizedName) && value.isNotBlank()) {
                            put(normalizedName, value.take(MAX_HEADER_VALUE_LENGTH))
                        }
                    }
                }
            }
            return SourceNetworkPolicy(
                tlsMode = json.optString("tlsMode", TLS_STRICT),
                allowedHosts = hosts,
                allowSubdomains = json.optBoolean("allowSubdomains", false),
                allowRedirectHosts = json.optBoolean("allowRedirectHosts", false),
                catalogAllowed = scopes?.optBoolean("catalog", true) ?: true,
                playbackAllowed = scopes?.optBoolean("playback", true) ?: true,
                customCaPem = json.optString("customCaPem")
                    .trim()
                    .takeIf { it.contains("BEGIN CERTIFICATE") && it.length <= MAX_CA_LENGTH },
                requestHeaders = headers,
                followRedirects = json.optBoolean("followRedirects", true),
                timeoutMs = json.optInt("timeoutMs", DEFAULT_TIMEOUT_MS)
                    .coerceIn(1_000, 180_000),
            ).validated()
        }

        private fun isAllowedHeader(name: String): Boolean {
            if (!name.matches(Regex("^[A-Za-z0-9-]{1,80}$"))) return false
            return name.lowercase(Locale.ROOT) !in BLOCKED_HEADERS
        }

        private val BLOCKED_HEADERS = setOf(
            "host",
            "content-length",
            "transfer-encoding",
            "connection",
            "proxy-connection",
            "upgrade",
        )
        private const val MAX_HEADER_VALUE_LENGTH = 2_048
        private const val MAX_CA_LENGTH = 65_535
    }

    private fun validated(): SourceNetworkPolicy {
        val mode = normalizedTlsMode
        if (mode == TLS_STRICT) return copy(tlsMode = mode, customCaPem = null)
        if (allowedHosts.isEmpty()) return strict()
        if (mode == TLS_CUSTOM_CA && customCaPem.isNullOrBlank()) return strict()
        return copy(tlsMode = mode)
    }
}

/**
 * Política ativa da lista cujo catálogo está em uso.
 *
 * O cliente especial nunca é global: ele é construído para a URL solicitada e
 * cada requisição, inclusive redirecionamentos, passa novamente pela lista de
 * hosts autorizados antes de abrir a conexão.
 */
object SourceNetworkPolicyRegistry {
    @Volatile
    private var activePolicy: SourceNetworkPolicy = SourceNetworkPolicy.strict()
    private val clients = object : LinkedHashMap<String, OkHttpClient>(16, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<String, OkHttpClient>?,
        ): Boolean = size > MAX_CLIENTS
    }

    fun activate(policy: SourceNetworkPolicy?) {
        activePolicy = policy ?: SourceNetworkPolicy.strict()
    }

    fun current(): SourceNetworkPolicy = activePolicy

    fun clientFor(rawUrl: String?, scope: SourceNetworkScope): OkHttpClient {
        val target = rawUrl?.let { runCatching { URL(it) }.getOrNull() }
        val current = activePolicy
        val policy = if (
            target != null &&
            current.appliesTo(scope) &&
            current.isHostAllowed(target.host)
        ) current else SourceNetworkPolicy.strict()
        val initialHost = target?.host?.let(::normalizeHost).orEmpty()
        val timeout = policy.timeoutMs.coerceIn(1_000, 180_000)
        val cacheKey = listOf(scope.name, initialHost, policy.cacheKey).joinToString("|")
        synchronized(clients) {
            clients[cacheKey]?.let { return it }
        }

        val builder = OkHttpClient.Builder()
            .connectTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .writeTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .followRedirects(policy.followRedirects)
            .followSslRedirects(policy.followRedirects)
            .retryOnConnectionFailure(true)
            .addNetworkInterceptor(policyInterceptor(policy, initialHost))

        when (policy.normalizedTlsMode) {
            SourceNetworkPolicy.TLS_INSECURE -> configureInsecure(builder, policy)
            SourceNetworkPolicy.TLS_CUSTOM_CA -> configureCustomCa(builder, policy)
        }
        val client = builder.build()
        synchronized(clients) {
            clients[cacheKey] = client
        }
        return client
    }

    private fun policyInterceptor(
        policy: SourceNetworkPolicy,
        initialHost: String,
    ) = Interceptor { chain ->
        val request = chain.request()
        val requestHost = normalizeHost(request.url.host)
        val hasSpecialPolicy = policy.normalizedTlsMode != SourceNetworkPolicy.TLS_STRICT ||
            policy.requestHeaders.isNotEmpty()

        if (hasSpecialPolicy) {
            if (!policy.isHostAllowed(requestHost)) {
                throw IOException("Domínio de redirecionamento não autorizado para esta fonte.")
            }
            if (
                initialHost.isNotBlank() &&
                requestHost != initialHost &&
                !policy.allowRedirectHosts
            ) {
                throw IOException("Redirecionamento para outro domínio bloqueado pela política da fonte.")
            }
        }

        val updated = request.newBuilder()
            .apply {
                if (request.header("User-Agent").isNullOrBlank()) {
                    header("User-Agent", DEFAULT_USER_AGENT)
                }
                if (request.header("Accept").isNullOrBlank()) header("Accept", "*/*")
                if (!hasSpecialPolicy || policy.isHostAllowed(requestHost)) {
                    policy.requestHeaders.forEach { (name, value) -> header(name, value) }
                }
            }
            .build()
        chain.proceed(updated)
    }

    private fun configureInsecure(builder: OkHttpClient.Builder, policy: SourceNetworkPolicy) {
        val trustManager = object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        }
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf(trustManager), SecureRandom())
        builder.sslSocketFactory(context.socketFactory, trustManager)
        builder.hostnameVerifier(HostnameVerifier { hostname, _ -> policy.isHostAllowed(hostname) })
    }

    private fun configureCustomCa(builder: OkHttpClient.Builder, policy: SourceNetworkPolicy) {
        val custom = customTrustManager(policy.customCaPem ?: return)
        val system = systemTrustManager()
        val composite = object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> =
                system.acceptedIssuers + custom.acceptedIssuers

            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
                runCatching { system.checkClientTrusted(chain, authType) }
                    .recoverCatching { custom.checkClientTrusted(chain, authType) }
                    .getOrThrow()
            }

            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                runCatching { system.checkServerTrusted(chain, authType) }
                    .recoverCatching { custom.checkServerTrusted(chain, authType) }
                    .getOrThrow()
            }
        }
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf(composite), SecureRandom())
        builder.sslSocketFactory(context.socketFactory, composite)
    }

    private fun customTrustManager(pem: String): X509TrustManager {
        val certificate = CertificateFactory.getInstance("X.509")
            .generateCertificate(ByteArrayInputStream(pem.toByteArray()))
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null, null)
            setCertificateEntry("roneca-custom-ca", certificate)
        }
        return trustManagerFor(store)
    }

    private fun systemTrustManager(): X509TrustManager = trustManagerFor(null)

    private fun trustManagerFor(store: KeyStore?): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(store)
        return factory.trustManagers.filterIsInstance<X509TrustManager>().single()
    }

    private const val DEFAULT_USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20"
    private const val MAX_CLIENTS = 16
}

private fun normalizeHost(value: String): String =
    value.trim().lowercase(Locale.ROOT).removePrefix("[").removeSuffix("]")
