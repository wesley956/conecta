package com.ronecaplaytv.nativeapp.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SourceNetworkPolicyTest {
    private fun policy(
        allowedHosts: Set<String> = setOf("gtop.in"),
        allowSubdomains: Boolean = false,
        allowRedirectHosts: Boolean = false,
    ) = SourceNetworkPolicy(
        tlsMode = SourceNetworkPolicy.TLS_INSECURE,
        allowedHosts = allowedHosts,
        allowSubdomains = allowSubdomains,
        allowRedirectHosts = allowRedirectHosts,
    )

    @Test
    fun allowsInitialRequestToAnAllowedHost() {
        val decision = evaluateRequestHost(policy(), initialHost = "gtop.in", requestHost = "gtop.in")

        assertEquals(RedirectDecision.Allow, decision)
    }

    @Test
    fun blocksInitialRequestToAHostNotInTheAllowlist() {
        val decision = evaluateRequestHost(policy(), initialHost = "gtop.in", requestHost = "evil.example")

        assertTrue(decision is RedirectDecision.Block)
    }

    @Test
    fun blocksRedirectToAnUnlistedCdnHostWhenRedirectHostsAreNotAllowed() {
        // Reproduz o caso real (#playback-redirect-block): a API de um fornecedor
        // Xtream (gtop.in) redireciona a entrega do vídeo pra um CDN em outro
        // domínio, que nunca estava pré-cadastrado em allowedHosts.
        val decision = evaluateRequestHost(
            policy(allowRedirectHosts = false),
            initialHost = "gtop.in",
            requestHost = "cdn-delivery.example.net",
        )

        assertTrue(decision is RedirectDecision.Block)
        assertEquals(
            "Redirecionamento para outro domínio bloqueado pela política da fonte.",
            (decision as RedirectDecision.Block).message,
        )
    }

    @Test
    fun allowsRedirectToAnUnlistedCdnHostWhenRedirectHostsAreAllowed() {
        // Antes da correção, isso também falhava: a checagem de allowedHosts era
        // aplicada antes da checagem de allowRedirectHosts, então o destino do
        // redirecionamento precisava estar pré-cadastrado mesmo com a opção
        // "permitir redirecionamento" ativa — o que na prática nunca acontecia.
        val decision = evaluateRequestHost(
            policy(allowRedirectHosts = true),
            initialHost = "gtop.in",
            requestHost = "cdn-delivery.example.net",
        )

        assertEquals(RedirectDecision.Allow, decision)
    }

    @Test
    fun stillRequiresTheInitialHostToBeAllowedEvenWithRedirectHostsAllowed() {
        // allowRedirectHosts nunca deve abrir a primeira conexão; ele só se aplica
        // a partir do momento em que o host inicial já foi validado.
        val decision = evaluateRequestHost(
            policy(allowRedirectHosts = true),
            initialHost = "gtop.in",
            requestHost = "gtop.in",
        )

        assertEquals(RedirectDecision.Allow, decision)

        val blockedInitial = evaluateRequestHost(
            policy(allowedHosts = setOf("outra-fonte.com"), allowRedirectHosts = true),
            initialHost = "gtop.in",
            requestHost = "gtop.in",
        )
        assertTrue(blockedInitial is RedirectDecision.Block)
    }

    @Test
    fun allowsSubdomainOfAnAllowedHostOnTheInitialRequest() {
        val decision = evaluateRequestHost(
            policy(allowedHosts = setOf("gtop.in"), allowSubdomains = true),
            initialHost = "cdn.gtop.in",
            requestHost = "cdn.gtop.in",
        )

        assertEquals(RedirectDecision.Allow, decision)
    }
}
