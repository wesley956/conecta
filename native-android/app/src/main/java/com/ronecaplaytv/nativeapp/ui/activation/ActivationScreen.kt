package com.ronecaplaytv.nativeapp.ui.activation

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.activation.DeviceAccessStatus
import com.ronecaplaytv.nativeapp.activation.DeviceSessionState
import com.ronecaplaytv.nativeapp.ui.brand.RonecaBrandLockup
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors
import com.ronecaplaytv.nativeapp.ui.support.SupportDetailsCard
import kotlinx.coroutines.delay

@Composable
fun ActivationScreen(
    state: DeviceSessionState,
    isTelevision: Boolean,
    onRefresh: () -> Unit,
    onReset: () -> Unit,
) {
    val context = LocalContext.current
    val copyFocusRequester = remember { FocusRequester() }
    val updateFocusRequester = remember { FocusRequester() }
    val scrollState = rememberScrollState()

    LaunchedEffect(isTelevision, state.status, state.deviceCode, state.isRefreshing) {
        if (isTelevision && !state.isRefreshing) {
            delay(220)
            val requester = if (state.deviceCode != null) copyFocusRequester else updateFocusRequester
            runCatching { requester.requestFocus() }
        }
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    listOf(
                        RonecaColors.Background,
                        RonecaColors.Surface.copy(alpha = 0.96f),
                        RonecaColors.Background,
                    ),
                ),
            ),
    ) {
        val expanded = maxWidth >= 840.dp || (isTelevision && maxWidth >= 720.dp)
        val medium = maxWidth >= 600.dp
        val horizontalPadding = when {
            expanded -> 56.dp
            medium -> 36.dp
            else -> 20.dp
        }

        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth(0.72f)
                .height(3.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            RonecaColors.Primary.copy(alpha = 0f),
                            RonecaColors.PrimaryStrong,
                            RonecaColors.Primary.copy(alpha = 0f),
                        ),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = horizontalPadding, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            RonecaBrandLockup(
                emblemSize = if (expanded) 76.dp else 56.dp,
                fontSize = if (expanded) 32.sp else 23.sp,
                modifier = Modifier.fillMaxWidth(if (expanded) 0.64f else 0.94f),
            )
            Spacer(modifier = Modifier.height(if (expanded) 16.dp else 12.dp))
            Text(
                text = titleFor(state.status),
                color = RonecaColors.TextPrimary,
                fontSize = if (expanded) 32.sp else 24.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = state.message ?: messageFor(state.status),
                color = RonecaColors.TextSecondary,
                fontSize = if (expanded) 15.sp else 13.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(if (expanded) 24.dp else 18.dp))

            if (expanded) {
                Row(
                    modifier = Modifier.fillMaxWidth().widthIn(max = 1040.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    state.deviceCode?.let { deviceCode ->
                        DeviceCodeCard(
                            deviceCode = deviceCode,
                            context = context,
                            isTelevision = isTelevision,
                            copyFocusRequester = copyFocusRequester,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    SupportDetailsCard(
                        profile = state.supportProfile,
                        isTelevision = isTelevision,
                        showQrCode = true,
                        modifier = Modifier.weight(1f),
                    )
                }
            } else {
                state.deviceCode?.let { deviceCode ->
                    DeviceCodeCard(
                        deviceCode = deviceCode,
                        context = context,
                        isTelevision = isTelevision,
                        copyFocusRequester = copyFocusRequester,
                        modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp),
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                }
                SupportDetailsCard(
                    profile = state.supportProfile,
                    isTelevision = isTelevision,
                    showQrCode = medium,
                    modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp),
                )
            }

            Spacer(modifier = Modifier.height(if (expanded) 20.dp else 16.dp))
            FocusableActionCard(
                title = if (state.isRefreshing) "Atualizando..." else "Atualizar acesso",
                subtitle = "Consultar liberação no painel",
                badge = "ATUALIZAR",
                enabled = !state.isRefreshing,
                isTelevision = isTelevision,
                accentColor = RonecaColors.Primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 720.dp)
                    .height(if (isTelevision) 96.dp else 88.dp),
                focusRequester = updateFocusRequester,
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
                        .widthIn(max = 720.dp)
                        .height(if (isTelevision) 96.dp else 88.dp),
                    onClick = onReset,
                )
            }
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun DeviceCodeCard(
    deviceCode: String,
    context: Context,
    isTelevision: Boolean,
    copyFocusRequester: FocusRequester,
    modifier: Modifier,
) {
    Column(
        modifier = modifier
            .background(RonecaColors.Surface, RoundedCornerShape(16.dp))
            .border(1.dp, RonecaColors.Primary.copy(alpha = 0.78f), RoundedCornerShape(16.dp))
            .padding(horizontal = 20.dp, vertical = 20.dp),
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
            color = RonecaColors.PrimaryStrong,
            fontSize = if (isTelevision) 36.sp else 28.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            FocusableActionCard(
                title = "Copiar código",
                subtitle = "Salvar na área de transferência",
                badge = "COPIAR",
                enabled = true,
                isTelevision = isTelevision,
                accentColor = RonecaColors.Primary,
                modifier = Modifier.fillMaxWidth().height(if (isTelevision) 90.dp else 84.dp),
                focusRequester = copyFocusRequester,
                onClick = { copyCode(context, deviceCode) },
            )
            FocusableActionCard(
                title = "Compartilhar",
                subtitle = "Enviar ao suporte ou vendedor",
                badge = "ENVIAR",
                enabled = true,
                isTelevision = isTelevision,
                accentColor = RonecaColors.Green,
                modifier = Modifier.fillMaxWidth().height(if (isTelevision) 90.dp else 84.dp),
                onClick = { shareCode(context, deviceCode) },
            )
        }
    }
}

private fun copyCode(context: Context, code: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Código Roneca Player TV", code))
}

private fun shareCode(context: Context, code: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, "Código de ativação Roneca Player TV: $code")
    }
    try {
        context.startActivity(Intent.createChooser(intent, "Enviar código de ativação"))
    } catch (_: ActivityNotFoundException) {
        copyCode(context, code)
    } catch (_: SecurityException) {
        copyCode(context, code)
    }
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
