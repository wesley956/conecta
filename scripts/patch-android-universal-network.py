from pathlib import Path
import re


def rep(path, old, new):
    p=Path(path); s=p.read_text(); n=s.count(old)
    if n != 1: raise SystemExit(f'{path}: literal count {n}: {old[:60]!r}')
    p.write_text(s.replace(old,new,1))


def sub(path, pattern, replacement, flags=re.S):
    p=Path(path); s=p.read_text(); s2,n=re.subn(pattern,replacement,s,count=1,flags=flags)
    if n != 1: raise SystemExit(f'{path}: regex count {n}: {pattern[:60]!r}')
    p.write_text(s2)

state='native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionState.kt'
rep(state,'package com.ronecaplaytv.nativeapp.activation\n','package com.ronecaplaytv.nativeapp.activation\n\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkPolicy\n')
rep(state,'    val seriesUrl: String?,\n) {','    val seriesUrl: String?,\n    val networkPolicy: SourceNetworkPolicy = SourceNetworkPolicy.strict(),\n) {')
api='native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt'
rep(api,'                                seriesUrl = itemCacheParts?.optNullableString("seriesUrl"),\n                            ),','                                seriesUrl = itemCacheParts?.optNullableString("seriesUrl"),\n                                networkPolicy = SourceNetworkPolicy.fromJson(item.optJSONObject("networkPolicy")),\n                            ),')

vm='native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt'
rep(vm,'import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport\n','import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry\n')
rep(vm,'            listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl).joinToString(":")\n','            listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl, it.networkPolicy.cacheKey).joinToString(":")\n')
rep(vm,'    ): LoadedCatalog {\n        val channelsUrl = candidate.channelsUrl\n','    ): LoadedCatalog {\n        SourceNetworkPolicyRegistry.activate(candidate.networkPolicy)\n        val channelsUrl = candidate.channelsUrl\n')

m3u='native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/DirectM3uClient.kt'
rep(m3u,'import kotlinx.coroutines.Dispatchers\n','import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkScope\nimport kotlinx.coroutines.Dispatchers\n')
sub(m3u,r'internal class DirectM3uClient \{\n    private val httpClient = OkHttpClient\.Builder\(\).*?        \.build\(\)\n\n','internal class DirectM3uClient {\n')
rep(m3u,'    private fun downloadAndParse(sourceUrl: String): DirectM3uCatalog {\n        val failures = mutableListOf<String>()\n','    private fun downloadAndParse(sourceUrl: String): DirectM3uCatalog {\n        val failures = mutableListOf<String>()\n        val httpClient = SourceNetworkPolicyRegistry.clientFor(sourceUrl, SourceNetworkScope.Catalog)\n')


def patch_xtream(path, fast=False):
    rep(path,'import org.json.JSONObject\n','import okhttp3.Request\nimport org.json.JSONObject\n')
    if fast:
        rep(path,'import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport\n','import com.ronecaplaytv.nativeapp.network.ProviderAttemptReport\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkScope\n')
        pattern=r'''        val connection = \(credentials\.apiUrl\(action\)\.openConnection\(\) as HttpURLConnection\)\.apply \{.*?        \} finally \{\n            connection\.disconnect\(\)\n        \}\n'''
        replacement='''        val endpoint = credentials.apiUrl(action)
        val request = Request.Builder().url(endpoint).get()
            .header("Accept", "application/json, text/plain, */*")
            .header("Connection", "close")
            .header("User-Agent", USER_AGENT)
            .build()
        val client = SourceNetworkPolicyRegistry.clientFor(endpoint.toString(), SourceNetworkScope.Catalog)
            .newBuilder()
            .readTimeout(readTimeoutMs.toLong(), java.util.concurrent.TimeUnit.MILLISECONDS)
            .build()

        return try {
            client.newCall(request).execute().use { response ->
                val status = response.code
                if (status !in 200..299) throw CatalogLoadException(when (status) {
                    401, 403 -> "[XTREAM_AUTH_INVALID] O servidor recusou as credenciais Xtream (HTTP $status)."
                    404 -> "[XTREAM_AUTH_ENDPOINT_NOT_FOUND] A API Xtream respondeu HTTP 404."
                    408, 429 -> "[XTREAM_SERVER_BUSY] A API Xtream respondeu HTTP $status."
                    else -> "[XTREAM_HTTP_ERROR] A API Xtream respondeu HTTP $status."
                })
                val body = response.body
                if (body.contentLength() > maximumBytes) throw CatalogLoadException("[XTREAM_RESPONSE_TOO_LARGE] A resposta Xtream excede o limite rápido.")
                val text = body.byteStream().use { readLimitedUtf8(it, maximumBytes) }
                if (text.isBlank()) throw CatalogLoadException("[XTREAM_RESPONSE_EMPTY] A API Xtream retornou uma resposta vazia.")
                if (text.trimStart().startsWith("<")) throw CatalogLoadException("[XTREAM_RESPONSE_HTML] A API Xtream devolveu HTML em vez de dados.")
                if (action != null) saveCache(cacheFile, text)
                text
            }
        } catch (error: Exception) {
            val staleAvailable = allowStale && cacheFile.isFile && cacheFile.length() in 1..maximumBytes &&
                now - cacheFile.lastModified() <= STALE_CACHE_TTL_MS
            if (staleAvailable) return cacheFile.readText(Charsets.UTF_8)
            throw mapConnectionError(error)
        }
'''
        sub(path,pattern,replacement)
        rep(path,'        is IOException -> CatalogLoadException(\n            "[XTREAM_CONNECTION_FAILED] Não foi possível conectar ao servidor Xtream.",\n        )\n','        is IOException -> CatalogLoadException(\n            if (generateSequence(error as Throwable?) { it.cause }.any { it is SSLException }) {\n                "[XTREAM_TLS_FAILED] A conexão segura com o servidor Xtream falhou."\n            } else {\n                "[XTREAM_CONNECTION_FAILED] Não foi possível conectar ao servidor Xtream."\n            },\n        )\n')
    else:
        rep(path,'import kotlinx.coroutines.Dispatchers\n','import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkScope\nimport kotlinx.coroutines.Dispatchers\n')
        pattern=r'''        val endpoint = credentials\.apiUrl\(action, extraParameters\)\n        val connection = .*?        \} finally \{\n            connection\.disconnect\(\)\n        \}\n'''
        replacement='''        val endpoint = credentials.apiUrl(action, extraParameters)
        val request = Request.Builder().url(endpoint).get()
            .header("Accept", "application/json, text/plain, */*")
            .header("Connection", "keep-alive")
            .header("User-Agent", USER_AGENT)
            .build()
        val client = SourceNetworkPolicyRegistry.clientFor(endpoint.toString(), SourceNetworkScope.Catalog)

        return try {
            client.newCall(request).execute().use { response ->
                val status = response.code
                if (status !in 200..299) {
                    val message = when (status) {
                        401, 403 -> "[XTREAM_AUTH_INVALID] O servidor recusou as credenciais Xtream (HTTP $status)."
                        404 -> "[XTREAM_AUTH_ENDPOINT_NOT_FOUND] A API Xtream respondeu HTTP 404."
                        408, 429 -> "[XTREAM_SERVER_BUSY] A API Xtream respondeu HTTP $status."
                        else -> "[XTREAM_HTTP_ERROR] A API Xtream respondeu HTTP $status" + action?.let { " em $it." }.orEmpty()
                    }
                    throw CatalogLoadException(message)
                }
                val body = response.body
                if (body.contentLength() > maximumBytes) throw CatalogLoadException("[XTREAM_RESPONSE_TOO_LARGE] A resposta Xtream excede o limite seguro.")
                val text = body.byteStream().use { readLimitedUtf8(it, maximumBytes) }
                if (text.isBlank()) throw CatalogLoadException("[XTREAM_RESPONSE_EMPTY] A API Xtream retornou uma resposta vazia" + action?.let { " em $it." }.orEmpty())
                if (text.trimStart().startsWith("<")) throw CatalogLoadException("[XTREAM_RESPONSE_HTML] A API Xtream devolveu uma página HTML em vez de dados.")
                if (useDiskCache) runCatching {
                    val temporary = File(cacheDirectory, "$cacheKey.tmp")
                    temporary.writeText(text, Charsets.UTF_8)
                    if (!temporary.renameTo(cacheFile)) { cacheFile.writeText(text, Charsets.UTF_8); temporary.delete() }
                }
                text
            }
        } catch (error: CatalogLoadException) { throw error
        } catch (error: SocketTimeoutException) { throw CatalogLoadException("[XTREAM_TIMEOUT] O servidor Xtream excedeu o tempo limite.")
        } catch (error: UnknownHostException) { throw CatalogLoadException("[XTREAM_DNS_FAILED] O domínio do servidor Xtream não foi encontrado.")
        } catch (error: SSLException) { throw CatalogLoadException("[XTREAM_TLS_FAILED] A conexão segura com o servidor Xtream falhou.")
        } catch (error: SocketException) { throw CatalogLoadException("[XTREAM_CONNECTION_RESET] O servidor Xtream encerrou a conexão.")
        } catch (error: IOException) {
            val tls = generateSequence(error as Throwable?) { it.cause }.any { it is SSLException }
            throw CatalogLoadException(if (tls) "[XTREAM_TLS_FAILED] A conexão segura com o servidor Xtream falhou." else "[XTREAM_CONNECTION_FAILED] Não foi possível conectar ao servidor Xtream.")
        }
'''
        sub(path,pattern,replacement)
        rep(path,'            runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8.name()) }\n','            runCatching { URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name()) }\n')

patch_xtream('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/DirectXtreamClient.kt')
patch_xtream('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/FastXtreamChannelClient.kt', True)

for path in ['native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt','native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt']:
    rep(path,'import androidx.media3.datasource.DefaultHttpDataSource\n','import androidx.media3.datasource.okhttp.OkHttpDataSource\n')
    rep(path,'import com.ronecaplaytv.nativeapp.catalog.','import com.ronecaplaytv.nativeapp.network.SourceNetworkPolicyRegistry\nimport com.ronecaplaytv.nativeapp.network.SourceNetworkScope\nimport com.ronecaplaytv.nativeapp.catalog.')

native='native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt'
sub(native,r'''    val mediaSourceFactory = remember\(context\) \{\n        val httpDataSourceFactory = DefaultHttpDataSource\.Factory\(\).*?        DefaultMediaSourceFactory\(DefaultDataSource\.Factory\(context, httpDataSourceFactory\)\)\n    \}\n''','''    val mediaSourceFactory = remember(context, sources) {
        val client = SourceNetworkPolicyRegistry.clientFor(sources.firstOrNull(), SourceNetworkScope.Playback)
        val httpDataSourceFactory = OkHttpDataSource.Factory(client).setDefaultRequestProperties(mapOf(
            "Accept" to "*/*", "Connection" to "keep-alive", "Icy-MetaData" to "1", "User-Agent" to IPTV_USER_AGENT,
        ))
        DefaultMediaSourceFactory(DefaultDataSource.Factory(context, httpDataSourceFactory))
    }
''')
series='native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt'
sub(series,r'''    val mediaSourceFactory = remember\(context\) \{\n        val httpDataSourceFactory = DefaultHttpDataSource\.Factory\(\).*?        DefaultMediaSourceFactory\(DefaultDataSource\.Factory\(context, httpDataSourceFactory\)\)\n    \}\n''','''    val mediaSourceFactory = remember(context, currentSources) {
        val client = SourceNetworkPolicyRegistry.clientFor(currentSources.firstOrNull(), SourceNetworkScope.Playback)
        val httpDataSourceFactory = OkHttpDataSource.Factory(client).setDefaultRequestProperties(mapOf(
            "Accept" to "*/*", "Connection" to "keep-alive", "User-Agent" to SERIES_IPTV_USER_AGENT,
        ))
        DefaultMediaSourceFactory(DefaultDataSource.Factory(context, httpDataSourceFactory))
    }
''')

rep('native-android/app/build.gradle.kts','    implementation("androidx.media3:media3-ui:1.9.2")\n','    implementation("androidx.media3:media3-ui:1.9.2")\n    implementation("androidx.media3:media3-datasource-okhttp:1.9.2")\n')
print('Android patches applied')
