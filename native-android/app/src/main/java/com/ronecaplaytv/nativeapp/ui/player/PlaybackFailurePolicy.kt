package com.ronecaplaytv.nativeapp.ui.player

import androidx.media3.common.PlaybackException
import androidx.media3.datasource.HttpDataSource
import com.ronecaplaytv.nativeapp.diagnostics.NativeDiagnostics

enum class PlaybackFailureKind(val diagnosticCode: String) {
    TransientNetwork("transient_network"),
    AccessDenied("access_denied"),
    NotFound("not_found"),
    UnsupportedFormat("unsupported_format"),
    Decoder("decoder"),
    SecureConnection("secure_connection"),
    RuntimeCheck("runtime_check"),
    Stalled("stalled"),
    Unknown("unknown"),
}

data class PlaybackFailure(
    val kind: PlaybackFailureKind,
    val retryable: Boolean,
    val userMessage: String,
) {
    val diagnosticCode: String
        get() = kind.diagnosticCode

    companion object {
        fun stalled(): PlaybackFailure = PlaybackFailure(
            kind = PlaybackFailureKind.Stalled,
            retryable = true,
            userMessage = "O servidor parou de enviar o conteúdo.",
        )
    }
}

fun classifyPlaybackFailure(error: PlaybackException): PlaybackFailure {
    val causes = generateSequence(error.cause) { it.cause }.take(12).toList()
    val httpStatus = causes.filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
        .firstOrNull()
        ?.responseCode
    val causeNames = causes.map { it::class.java.name }
    val failure = classifyPlaybackFailure(error.errorCodeName, httpStatus, causeNames)
    // #423/PLAYER-01 (diagnóstico): antes o status HTTP calculado aqui (401/429/500...) era usado só
    // para decidir se tenta de novo, e descartado depois — o painel nunca sabia se era bloqueio (403),
    // limite de conexões (429) ou outra coisa. Agora ele viaja junto até o diagnóstico enviado ao servidor.
    NativeDiagnostics.recordPlaybackFailure(error, failure.diagnosticCode, httpStatus)
    return failure
}

internal fun classifyPlaybackFailure(
    errorCodeName: String,
    httpStatus: Int? = null,
    causeClassNames: List<String> = emptyList(),
): PlaybackFailure {
    if (httpStatus == 401 || httpStatus == 403) {
        return permanent(
            PlaybackFailureKind.AccessDenied,
            "Acesso recusado pelo fornecedor.",
        )
    }
    if (httpStatus == 404 || httpStatus == 410) {
        return permanent(
            PlaybackFailureKind.NotFound,
            "Conteúdo indisponível no servidor.",
        )
    }
    if (httpStatus == 408 || httpStatus == 425 || httpStatus == 429 || httpStatus in 500..599) {
        return transient("Conexão instável com o servidor.")
    }

    val normalized = errorCodeName.uppercase()
    if (causeClassNames.any { name ->
            name.contains("SSL", ignoreCase = true) ||
                name.contains("CERTIFICATE", ignoreCase = true)
        }
    ) {
        return permanent(
            PlaybackFailureKind.SecureConnection,
            "Não foi possível validar a conexão segura do servidor.",
        )
    }

    return when {
        normalized.contains("NETWORK_CONNECTION") ||
            normalized.contains("NETWORK_TIMEOUT") ||
            normalized.contains("IO_UNSPECIFIED") -> transient("Conexão instável com o servidor.")

        normalized.contains("BAD_HTTP_STATUS") -> permanent(
            PlaybackFailureKind.AccessDenied,
            "O servidor recusou a reprodução deste conteúdo.",
        )

        normalized.contains("FILE_NOT_FOUND") -> permanent(
            PlaybackFailureKind.NotFound,
            "Conteúdo indisponível no servidor.",
        )

        normalized.contains("PARSING") ||
            normalized.contains("CONTAINER_UNSUPPORTED") ||
            normalized.contains("FORMAT_UNSUPPORTED") -> permanent(
            PlaybackFailureKind.UnsupportedFormat,
            "Formato não suportado neste dispositivo.",
        )

        normalized.contains("DECODING") ||
            normalized.contains("DECODER") ||
            normalized.contains("AUDIO_TRACK") -> permanent(
            PlaybackFailureKind.Decoder,
            "Não foi possível decodificar este conteúdo neste dispositivo.",
        )

        normalized.contains("CLEARTEXT_NOT_PERMITTED") -> permanent(
            PlaybackFailureKind.SecureConnection,
            "A conexão sem criptografia foi bloqueada pela segurança do dispositivo.",
        )

        // #375 (PLAYER-01): antes este erro era 'permanent' (retryable=false). Numa TV ao vivo isso fazia
        // o player pular direto pra próxima fonte/lista reserva sem NENHUMA nova tentativa na mesma fonte —
        // só filme/série ganhavam uma chance (troca pra decoder por software, 1 vez). Como 87% das falhas
        // reais eram deste tipo (dado do painel), e o erro costuma ser um estado interno transitório do
        // ExoPlayer (não necessariamente o decoder), agora ele ganha a mesma janela de 3 tentativas com
        // espera (2s/4s/8s) que os outros erros transitórios já tinham, em qualquer tipo de conteúdo.
        normalized.contains("FAILED_RUNTIME_CHECK") -> PlaybackFailure(
            kind = PlaybackFailureKind.RuntimeCheck,
            retryable = true,
            userMessage = "O player encontrou um estado interno inválido durante a reprodução.",
        )

        else -> permanent(
            PlaybackFailureKind.Unknown,
            "Não foi possível reproduzir este conteúdo.",
        )
    }
}

internal fun retryDelayMillis(attempt: Int): Long? = RETRY_BACKOFF_MILLIS.getOrNull(attempt)

private fun transient(message: String) = PlaybackFailure(
    kind = PlaybackFailureKind.TransientNetwork,
    retryable = true,
    userMessage = message,
)

private fun permanent(kind: PlaybackFailureKind, message: String) = PlaybackFailure(
    kind = kind,
    retryable = false,
    userMessage = message,
)

private val RETRY_BACKOFF_MILLIS = longArrayOf(2_000L, 4_000L, 8_000L)
