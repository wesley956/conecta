from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} missing')
    return text.replace(old, new, 1)


# Server: include every active universal endpoint in validation config.
path = Path('supabase/functions/device-config-qualified/index.ts')
text = path.read_text()
text = replace_once(
    text,
    """      connection_profile:panel_playlist_connection_profiles(
        custom_ca_pem,
        request_headers,
        timeout_ms,
        follow_redirects
      )
    `)""",
    """      connection_profile:panel_playlist_connection_profiles(
        custom_ca_pem,
        request_headers,
        timeout_ms,
        follow_redirects
      ),
      endpoints:panel_playlist_endpoints(
        id,
        endpoint_type,
        label,
        endpoint_url,
        protocol,
        host,
        port,
        path,
        output_format,
        priority,
        is_primary,
        active
      )
    `)""",
    'validation playlist select anchor',
)

direct_parts = """function directParts(sourceUrl: string) {
  const marked = `${sourceUrl.split(DIRECT_MARKER)[0]}${DIRECT_MARKER}`;
  return {
    manifestUrl: null,
    channelsUrl: marked,
    moviesUrl: marked,
    seriesUrl: marked,
  };
}
"""
validation_sources = direct_parts + """
function validationSources(playlist: any) {
  const endpoints = (Array.isArray(playlist?.endpoints) ? playlist.endpoints : [])
    .filter((endpoint: any) => endpoint?.active !== false && text(endpoint?.endpoint_url))
    .sort((left: any, right: any) => {
      const primaryDifference = Number(right?.is_primary === true) - Number(left?.is_primary === true);
      if (primaryDifference !== 0) return primaryDifference;
      return Number(left?.priority || 999) - Number(right?.priority || 999);
    })
    .map((endpoint: any, index: number) => ({
      id: String(endpoint.id),
      label: text(endpoint.label) || `Origem ${index + 1}`,
      type: text(endpoint.endpoint_type) || 'm3u',
      priority: index + 1,
      primary: index === 0,
      protocol: text(endpoint.protocol),
      host: text(endpoint.host),
      port: endpoint.port == null ? null : Number(endpoint.port),
      path: text(endpoint.path) || '/',
      outputFormat: text(endpoint.output_format),
      cacheParts: directParts(String(endpoint.endpoint_url)),
    }));

  if (endpoints.length > 0) return endpoints;
  const sourceUrl = text(playlist?.playlist_url);
  if (!sourceUrl) return [];
  return [{
    id: `legacy:${playlist.id}`,
    label: 'Origem principal',
    type: text(playlist?.playlist_type) || 'm3u',
    priority: 1,
    primary: true,
    protocol: null,
    host: sourceHost(sourceUrl),
    port: null,
    path: '/',
    outputFormat: null,
    cacheParts: directParts(sourceUrl),
  }];
}
"""
text = replace_once(text, direct_parts, validation_sources, 'directParts anchor')
text = replace_once(
    text,
    """      const sourceUrl = text(playlist.playlist_url);
      if (!sourceUrl) {
        return json({
          active: false,
          status: 'pending',
          deviceCode,
          message: 'A origem da lista de validação não está disponível.',
        });
      }
      const parts = directParts(sourceUrl);
      const item = {
""",
    """      const sources = validationSources(playlist);
      if (sources.length === 0) {
        return json({
          active: false,
          status: 'pending',
          deviceCode,
          message: 'A origem da lista de validação não está disponível.',
        });
      }
      const parts = sources[0].cacheParts;
      const item = {
""",
    'validation source block',
)
text = replace_once(
    text,
    """        cacheParts: parts,
        networkPolicy: playlistNetworkPolicy(playlist),
      };""",
    """        cacheParts: parts,
        sourceEndpoints: sources,
        networkPolicy: playlistNetworkPolicy(playlist),
      };""",
    'validation item anchor',
)
path.write_text(text)


# Android model: preserve endpoint alternatives.
path = Path('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionState.kt')
text = path.read_text()
text = replace_once(
    text,
    '    val networkPolicy: SourceNetworkPolicy = SourceNetworkPolicy.strict(),\n) {',
    '    val networkPolicy: SourceNetworkPolicy = SourceNetworkPolicy.strict(),\n    val sourceEndpoints: List<DeviceSourceEndpoint> = emptyList(),\n) {',
    'DevicePlaylistConfig anchor',
)
if 'data class DeviceSourceEndpoint(' not in text:
    text += """

data class DeviceSourceEndpoint(
    val id: String,
    val label: String,
    val type: String,
    val priority: Int,
    val primary: Boolean,
    val channelsUrl: String?,
    val moviesUrl: String?,
    val seriesUrl: String?,
)
"""
path.write_text(text)


# Parse endpoint matrix from device config.
path = Path('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt')
text = path.read_text()
text = replace_once(
    text,
    'import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig\n',
    'import com.ronecaplaytv.nativeapp.activation.DevicePlaylistConfig\nimport com.ronecaplaytv.nativeapp.activation.DeviceSourceEndpoint\n',
    'DeviceApi import anchor',
)
text = replace_once(
    text,
    """                        add(
                            DevicePlaylistConfig(
                                id = id,
                                name = item.optNullableString("name") ?: "Lista ${index + 1}",
""",
    """                        val sourceEndpointsJson = item.optJSONArray("sourceEndpoints")
                        val sourceEndpoints = buildList {
                            if (sourceEndpointsJson != null) {
                                for (sourceIndex in 0 until sourceEndpointsJson.length()) {
                                    val source = sourceEndpointsJson.optJSONObject(sourceIndex) ?: continue
                                    val sourceId = source.optNullableString("id") ?: continue
                                    val sourceParts = source.optJSONObject("cacheParts")
                                    add(
                                        DeviceSourceEndpoint(
                                            id = sourceId,
                                            label = source.optNullableString("label") ?: "Origem ${sourceIndex + 1}",
                                            type = source.optNullableString("type") ?: "m3u",
                                            priority = source.optInt("priority", sourceIndex + 1).coerceAtLeast(1),
                                            primary = source.optBoolean("primary", sourceIndex == 0),
                                            channelsUrl = sourceParts?.optNullableString("channelsUrl"),
                                            moviesUrl = sourceParts?.optNullableString("moviesUrl"),
                                            seriesUrl = sourceParts?.optNullableString("seriesUrl"),
                                        ),
                                    )
                                }
                            }
                        }.sortedBy(DeviceSourceEndpoint::priority)
                        add(
                            DevicePlaylistConfig(
                                id = id,
                                name = item.optNullableString("name") ?: "Lista ${index + 1}",
""",
    'DeviceApi playlist parser anchor',
)
text = replace_once(
    text,
    """                                networkPolicy = SourceNetworkPolicy.fromJson(item.optJSONObject("networkPolicy")),
                            ),""",
    """                                networkPolicy = SourceNetworkPolicy.fromJson(item.optJSONObject("networkPolicy")),
                                sourceEndpoints = sourceEndpoints,
                            ),""",
    'DeviceApi network policy anchor',
)
path.write_text(text)


# Catalog: try every endpoint inside the same playlist before failing the playlist.
path = Path('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt')
text = path.read_text()
text = replace_once(
    text,
    'listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl, it.networkPolicy.cacheKey).joinToString(":")',
    'listOf(it.id, it.channelsUrl, it.moviesUrl, it.seriesUrl, it.networkPolicy.cacheKey, it.sourceEndpoints.joinToString(",") { source -> listOf(source.id, source.channelsUrl, source.moviesUrl, source.seriesUrl).joinToString("~") }).joinToString(":")',
    'Catalog key anchor',
)
text = replace_once(
    text,
    """    private suspend fun loadCompleteCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        SourceNetworkPolicyRegistry.activate(candidate.networkPolicy)
        val channelsUrl = candidate.channelsUrl
""",
    """    private suspend fun loadCompleteCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        SourceNetworkPolicyRegistry.activate(candidate.networkPolicy)
        val endpointCandidates = candidate.sourceEndpoints.map { source ->
            candidate.copy(
                channelsUrl = source.channelsUrl,
                moviesUrl = source.moviesUrl,
                seriesUrl = source.seriesUrl,
                sourceEndpoints = emptyList(),
            )
        }.ifEmpty { listOf(candidate) }

        var lastEndpointFailure: Throwable? = null
        for ((sourceIndex, endpointCandidate) in endpointCandidates.withIndex()) {
            val sourcePrefix = if (sourceIndex == 0) prefix else "${prefix}alternativa ${sourceIndex + 1}: "
            val result = runCatching { loadSingleEndpointCatalog(endpointCandidate, sourcePrefix) }
            result.getOrNull()?.let { return it }
            lastEndpointFailure = result.exceptionOrNull()
        }
        throw lastEndpointFailure ?: CatalogLoadException("Nenhuma origem desta lista pôde ser carregada.")
    }

    private suspend fun loadSingleEndpointCatalog(
        candidate: DevicePlaylistConfig,
        prefix: String,
    ): LoadedCatalog {
        val channelsUrl = candidate.channelsUrl
""",
    'Catalog loadCompleteCatalog anchor',
)
path.write_text(text)


# Contract checks.
path = Path('scripts/check-universal-playlist-source.mjs')
text = path.read_text()
if 'Homologação universal: matriz de endpoints' not in text:
    text += """

const qualifiedConfigSource = await readFile(new URL('../supabase/functions/device-config-qualified/index.ts', import.meta.url), 'utf8');
const deviceApiSource = await readFile(new URL('../native-android/app/src/main/java/com/ronecaplaytv/nativeapp/network/DeviceApi.kt', import.meta.url), 'utf8');
const sessionStateSource = await readFile(new URL('../native-android/app/src/main/java/com/ronecaplaytv/nativeapp/activation/DeviceSessionState.kt', import.meta.url), 'utf8');
const catalogSource = await readFile(new URL('../native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt', import.meta.url), 'utf8');
assert.match(qualifiedConfigSource, /sourceEndpoints: sources/);
assert.match(qualifiedConfigSource, /panel_playlist_endpoints/);
assert.match(deviceApiSource, /DeviceSourceEndpoint/);
assert.match(sessionStateSource, /sourceEndpoints: List<DeviceSourceEndpoint>/);
assert.match(catalogSource, /loadSingleEndpointCatalog/);
assert.match(catalogSource, /endpointCandidates/);
console.log('Homologação universal: matriz de endpoints enviada e testada dentro da mesma lista.');
"""
path.write_text(text)
