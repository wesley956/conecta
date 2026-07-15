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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.activation.DeviceSessionState

@Composable
fun ActivationScreen(
    state: DeviceSessionState,
    isTelevision: Boolean,
    onRefresh: () -> Unit,
    onReset: () -> Unit,
) {
    val horizontalPadding = if (isTelevision) 72.dp else 24.dp
    val titleSize = if (isTelevision) 42.sp else 29.sp
    val bodySize = if (isTelevision) 21.sp else 17.sp
    val codeSize = if (isTelevision) 46.sp else 34.sp

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF080B12))
            .padding(horizontal = horizontalPadding, vertical = 32.dp),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .widthIn(max = 880.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = titleFor(state.status),
                color = Color.White,
                fontSize = titleSize,
                fontWeight = FontWeight.Bold,
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
                        .widthIn(max = 600.dp)
                        .background(Color(0xFF141A2A), RoundedCornerShape(18.dp))
                        .border(2.dp, Color(0xFF7C5CFF), RoundedCornerShape(18.dp))
                        .padding(horizontal = 24.dp, vertical = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Código do aparelho",
                        color = Color(0xFFB8C0D9),
                        fontSize = if (isTelevision) 18.sp else 15.sp,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = deviceCode,
                        color = Color.White,
                        fontSize = codeSize,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 36.dp else 28.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = onRefresh,
                    enabled = !state.isRefreshing,
                ) {
                    Text(
                        text = if (state.isRefreshing) "Atualizando..." else "Atualizar",
                        fontSize = if (isTelevision) 20.sp else 16.sp,
                    )
                }

                if (state.status == DeviceAccessStatus.Blocked || state.status == DeviceAccessStatus.Error) {
                    Button(
                        onClick = onReset,
                        enabled = !state.isRefreshing,
                    ) {
                        Text(
                            text = "Gerar novo código",
                            fontSize = if (isTelevision) 20.sp else 16.sp,
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
