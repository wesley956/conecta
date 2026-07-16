package com.ronecaplaytv.nativeapp.ui.activation

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.activation.DeviceSessionState
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import kotlinx.coroutines.delay

@Composable
fun ActivationScreen(
    state: DeviceSessionState,
    isTelevision: Boolean,
    onRefresh: () -> Unit,
    onReset: () -> Unit,
) {
    val context = LocalContext.current
    val primaryFocusRequester = remember { FocusRequester() }

    LaunchedEffect(isTelevision, state.status, state.isRefreshing) {
        if (isTelevision && !state.isRefreshing) {
            delay(220)
            runCatching { primaryFocusRequester.requestFocus() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(RonecaColors.Background)
            .padding(
                horizontal = if (isTelevision) 72.dp else 24.dp,
                vertical = 30.dp,
            ),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .widthIn(max = 780.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "▣  RonecaPlayTV",
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 20.sp else 17.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = titleFor(state.status),
                color = RonecaColors.TextPrimary,
                fontSize = if (isTelevision) 34.sp else 25.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = state.message ?: messageFor(state.status),
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 16.sp else 14.sp,
                textAlign = TextAlign.Center,
            )

            state.deviceCode?.let { deviceCode ->
                Spacer(modifier = Modifier.height(if (isTelevision) 28.dp else 22.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 560.dp)
                        .background(RonecaColors.Surface, RoundedCornerShape(16.dp))
                        .border(1.dp, RonecaColors.Primary, RoundedCornerShape(16.dp))
                        .padding(horizontal = 24.dp, vertical = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "CÓDIGO DO DISPOSITIVO",
                        color = RonecaColors.TextSecondary,
                        fontSize = if (isTelevision) 13.sp else 11.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 1.2.sp,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = deviceCode,
                        color = RonecaColors.TextPrimary,
                        fontSize = if (isTelevision) 38.sp else 28.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(18.dp))

                    if (isTelevision) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            FocusableActionCard(
                                title = "Copiar código",
                                subtitle = "Salvar na área de transferência",
                                badge = "COPIAR",
                                enabled = true,
                                isTelevision = true,
                                accentColor = RonecaColors.Primary,
                                modifier = Modifier.weight(1f).height(96.dp),
                                onClick = { copyCode(context, deviceCode) },
                            )
                            FocusableActionCard(
                                title = "Compartilhar",
                                subtitle = "Enviar ao suporte ou vendedor",
                                badge = "ENVIAR",
                                enabled = true,
                                isTelevision = true,
                                accentColor = RonecaColors.Green,
                                modifier = Modifier.weight(1f).height(96.dp),
                                onClick = { shareCode(context, deviceCode) },
                            )
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            FocusableActionCard(
                                title = "Copiar código",
                                subtitle = "Salvar na área de transferência",
                                badge = "COPIAR",
                                enabled = true,
                                isTelevision = false,
                                accentColor = RonecaColors.Primary,
                                modifier = Modifier.fillMaxWidth().height(90.dp),
                                onClick = { copyCode(context, deviceCode) },
                            )
                            FocusableActionCard(
                                title = "Enviar código",
                                subtitle = "Compartilhar com o suporte",
                                badge = "ENVIAR",
                                enabled = true,
                                isTelevision = false,
                                accentColor = RonecaColors.Green,
                                modifier = Modifier.fillMaxWidth().height(90.dp),
                                onClick = { shareCode(context, deviceCode) },
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(if (isTelevision) 24.dp else 20.dp))

            FocusableActionCard(
                title = if (state.isRefreshing) "Atualizando..." else "Atualizar acesso",
                subtitle = "Consultar liberação no painel",
                badge = "ATUALIZAR",
                enabled = !state.isRefreshing,
                isTelevision = isTelevision,
                accentColor = RonecaColors.Primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 560.dp)
                    .height(if (isTelevision) 100.dp else 90.dp),
                focusRequester = primaryFocusRequester,
                onClick = onRefresh,
            )

            if (state.status == DeviceAccessStatus.Blocked || state.status == DeviceAccessStatus.Error) {
                Spacer(modifier = Modifier.height(10.dp))
                FocusableActionCard(
                    title = "Gerar novo código",
                    subtitle = "Reiniciar a identidade segura deste aparelho",
                    badge = "REINICIAR",
                    enabled = !state.isRefreshing,
                    isTelevision = isTelevision,
                    accentColor = RonecaColors.Error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 560.dp)
                        .height(if (isTelevision) 100.dp else 90.dp),
                    onClick = onReset,
                )
            }
        }
    }
}

private fun copyCode(context: Context, code: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Código RonecaPlayTV", code))
}

private fun shareCode(context: Context, code: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, "Código de ativação RonecaPlayTV: $code")
    }
    context.startActivity(Intent.createChooser(intent, "Enviar código de ativação"))
}

private fun titleFor(status: DeviceAccessStatus): String = when (status) {
    DeviceAccessStatus.Loading -> "Preparando dispositivo"
    DeviceAccessStatus.Pending -> "Ativar dispositivo"
    DeviceAccessStatus.Active -> "Dispositivo ativo"
    DeviceAccessStatus.Blocked -> "Acesso bloqueado"
    DeviceAccessStatus.Expired -> "Assinatura expirada"
    DeviceAccessStatus.Error -> "Falha de conexão"
}

private fun messageFor(status: DeviceAccessStatus): String = when (status) {
    DeviceAccessStatus.Loading -> "Conectando ao painel com segurança."
    DeviceAccessStatus.Pending -> "Copie o código abaixo e envie para o suporte ou vendedor."
    DeviceAccessStatus.Active -> "Acesso liberado."
    DeviceAccessStatus.Blocked -> "A identidade segura deste aparelho não foi confirmada."
    DeviceAccessStatus.Expired -> "Renove a assinatura para continuar."
    DeviceAccessStatus.Error -> "Confira a internet e tente novamente."
}
