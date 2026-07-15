package com.ronecaplaytv.nativeapp.ui.activation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.activation.DeviceSessionState
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import kotlinx.coroutines.delay

@Composable
fun ActivationScreen(
    state: DeviceSessionState,
    isTelevision: Boolean,
    onRefresh: () -> Unit,
    onReset: () -> Unit,
) {
    val primaryFocusRequester = remember { FocusRequester() }

    LaunchedEffect(isTelevision, state.status, state.isRefreshing) {
        if (isTelevision && !state.isRefreshing) {
            delay(220)
            runCatching { primaryFocusRequester.requestFocus() }
        }
    }

    val horizontalPadding = if (isTelevision) 72.dp else 24.dp
    val titleSize = if (isTelevision) 42.sp else 29.sp
    val bodySize = if (isTelevision) 21.sp else 17.sp
    val codeSize = if (isTelevision) 46.sp else 34.sp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF090612),
                        Color(0xFF130D27),
                        Color(0xFF070911),
                    ),
                ),
            )
            .padding(horizontal = horizontalPadding, vertical = 32.dp),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .widthIn(max = 900.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "RONECA PLAY TV",
                color = Color(0xFFB99BFF),
                fontSize = if (isTelevision) 17.sp else 13.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = titleFor(state.status),
                color = Color.White,
                fontSize = titleSize,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(14.dp))

            Text(
                text = state.message ?: messageFor(state.status),
                color = Color(0xFFB8C0D9),
                fontSize = bodySize,
                textAlign = TextAlign.Center,
            )

            state.deviceCode?.let { deviceCode ->
                Spacer(modifier = Modifier.height(if (isTelevision) 34.dp else 26.dp))

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 620.dp)
                        .background(Color(0xFF171B2A), RoundedCornerShape(24.dp))
                        .border(2.dp, Color(0xFF8F6BFF), RoundedCornerShape(24.dp))
                        .padding(horizontal = 28.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "CÓDIGO DO APARELHO",
                        color = Color(0xFFAEB6CD),
                        fontSize = if (isTelevision) 16.sp else 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = deviceCode,
                        color = Color.White,
                        fontSize = codeSize,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 36.dp else 28.dp))

            if (isTelevision) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FocusableActionCard(
                        title = if (state.isRefreshing) "Atualizando..." else "Atualizar acesso",
                        subtitle = "Consultar liberação no painel",
                        enabled = !state.isRefreshing,
                        isTelevision = true,
                        modifier = Modifier.weight(1f),
                        focusRequester = primaryFocusRequester,
                        onClick = onRefresh,
                    )

                    if (state.status == DeviceAccessStatus.Blocked || state.status == DeviceAccessStatus.Error) {
                        FocusableActionCard(
                            title = "Gerar novo código",
                            subtitle = "Reiniciar a identidade deste aparelho",
                            enabled = !state.isRefreshing,
                            isTelevision = true,
                            modifier = Modifier.weight(1f),
                            onClick = onReset,
                        )
                    }
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    FocusableActionCard(
                        title = if (state.isRefreshing) "Atualizando..." else "Atualizar acesso",
                        subtitle = "Consultar liberação no painel",
                        enabled = !state.isRefreshing,
                        isTelevision = false,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = onRefresh,
                    )

                    if (state.status == DeviceAccessStatus.Blocked || state.status == DeviceAccessStatus.Error) {
                        FocusableActionCard(
                            title = "Gerar novo código",
                            subtitle = "Reiniciar a identidade deste aparelho",
                            enabled = !state.isRefreshing,
                            isTelevision = false,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = onReset,
                        )
                    }
                }
            }
        }
    }
}

private fun titleFor(status: DeviceAccessStatus): String = when (status) {
    DeviceAccessStatus.Loading -> "Preparando o aparelho"
    DeviceAccessStatus.Pending -> "Aguardando liberação"
    DeviceAccessStatus.Active -> "Aparelho ativo"
    DeviceAccessStatus.Blocked -> "Acesso bloqueado"
    DeviceAccessStatus.Expired -> "Assinatura expirada"
    DeviceAccessStatus.Error -> "Falha de conexão"
}

private fun messageFor(status: DeviceAccessStatus): String = when (status) {
    DeviceAccessStatus.Loading -> "Conectando ao painel com segurança."
    DeviceAccessStatus.Pending -> "Envie o código ao administrador ou vendedor e pressione Atualizar."
    DeviceAccessStatus.Active -> "Acesso liberado."
    DeviceAccessStatus.Blocked -> "A identidade segura deste aparelho não foi confirmada."
    DeviceAccessStatus.Expired -> "Renove a assinatura para continuar."
    DeviceAccessStatus.Error -> "Confira a internet e tente novamente."
}
