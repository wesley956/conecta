package com.ronecaplaytv.nativeapp.ui.support

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.Text
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.ronecaplaytv.nativeapp.activation.SupportProfile
import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun SupportDetailsCard(
    profile: SupportProfile,
    isTelevision: Boolean,
    showQrCode: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val contactUri = profile.primaryContactUri

    Column(
        modifier = modifier
            .background(RonecaColors.Surface, RoundedCornerShape(16.dp))
            .border(1.dp, RonecaColors.Border, RoundedCornerShape(16.dp))
            .padding(if (isTelevision) 20.dp else 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "PRECISA DE AJUDA?",
            color = RonecaColors.Primary,
            fontSize = if (isTelevision) 12.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
        Text(
            text = profile.displayName,
            color = RonecaColors.TextPrimary,
            fontSize = if (isTelevision) 21.sp else 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        profile.supportText?.let {
            Text(
                text = it,
                color = RonecaColors.TextSecondary,
                fontSize = if (isTelevision) 13.sp else 12.sp,
                textAlign = TextAlign.Center,
            )
        }
        profile.businessHours?.let {
            Text(text = it, color = RonecaColors.TextMuted, fontSize = 12.sp, textAlign = TextAlign.Center)
        }

        if (showQrCode && contactUri != null) {
            Spacer(modifier = Modifier.height(2.dp))
            SupportQrCode(uri = contactUri, size = if (isTelevision) 190 else 156)
            Text(
                text = "Aponte a câmera do celular",
                color = RonecaColors.TextMuted,
                fontSize = 11.sp,
            )
        }

        profile.whatsapp?.let {
            Text(text = "WhatsApp: $it", color = RonecaColors.TextSecondary, fontSize = 12.sp)
        }
        profile.email?.let {
            Text(text = it, color = RonecaColors.TextSecondary, fontSize = 12.sp)
        }

        FocusableActionCard(
            title = profile.contactLabel ?: "Contato indisponível",
            subtitle = if (contactUri != null) "Abrir contato seguro" else "Envie o código ao seu fornecedor",
            badge = if (contactUri != null) "ABRIR" else "INFO",
            enabled = contactUri != null,
            isTelevision = isTelevision,
            accentColor = RonecaColors.Green,
            modifier = Modifier.fillMaxWidth().height(if (isTelevision) 92.dp else 84.dp),
            onClick = {
                if (contactUri != null && !openSupportUri(context, contactUri)) {
                    copySupportContact(context, contactUri)
                    Toast.makeText(context, "Contato copiado.", Toast.LENGTH_SHORT).show()
                }
            },
        )
    }
}

@Composable
fun SupportDialog(
    profile: SupportProfile,
    isTelevision: Boolean,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .background(Color.Black.copy(alpha = 0.72f))
                .padding(if (isTelevision) 32.dp else 18.dp),
            contentAlignment = Alignment.Center,
        ) {
            SupportDetailsCard(
                profile = profile,
                isTelevision = isTelevision,
                showQrCode = isTelevision,
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = if (isTelevision) 620.dp else 480.dp),
            )
        }
    }
}

@Composable
private fun SupportQrCode(uri: String, size: Int) {
    val bitmap = remember(uri, size) { createQrBitmap(uri, size) }
    if (bitmap != null) {
        Box(
            modifier = Modifier
                .size(size.dp)
                .background(Color.White, RoundedCornerShape(8.dp))
                .padding(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "QR Code do suporte",
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun createQrBitmap(content: String, size: Int): Bitmap? = runCatching {
    val matrix = QRCodeWriter().encode(
        content,
        BarcodeFormat.QR_CODE,
        size,
        size,
        mapOf(
            EncodeHintType.MARGIN to 2,
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        ),
    )
    Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply {
        for (y in 0 until size) {
            for (x in 0 until size) {
                setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
    }
}.getOrNull()

private fun openSupportUri(context: Context, value: String): Boolean = runCatching {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(value))
    context.startActivity(intent)
    true
}.recoverCatching { error ->
    if (error is ActivityNotFoundException || error is SecurityException) false else throw error
}.getOrDefault(false)

private fun copySupportContact(context: Context, value: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Contato de suporte", value))
}
