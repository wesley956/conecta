package com.ronecaplaytv.nativeapp.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * Varredura completa (achado #10): o app inteiro usava caracteres Unicode (⌘ ★ ☆ ▶ Ⅱ ↶ ↷ ● ...)
 * como se fossem ícones. Em TVs com fonte reduzida/incompleta no firmware, um glifo assim pode
 * não existir e aparecer como um quadradinho ("tofu") em vez do símbolo pretendido. Estes ícones
 * são desenhados com Canvas — mesmo padrão já usado em QuickGlyph (HomeScreen.kt) — e nunca
 * dependem de fonte alguma. Não adiciona dependência nova ao projeto.
 *
 * Esta primeira leva cobre os dois símbolos mais repetidos no app (lupa de busca e estrela de
 * favorito). Os demais (▶ play, Ⅱ pause, ↶/↷ avançar/voltar, ⌘ menu, ● indicador ao vivo) ficam
 * para uma próxima leva — estão concentrados nos arquivos do player, que são os maiores e mais
 * sensíveis do app.
 */
@Composable
fun SearchGlyph(
    color: Color,
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 14.dp,
) {
    Canvas(modifier = modifier.size(size)) {
        val stroke = Stroke(width = this.size.minDimension * 0.11f)
        val circleRadius = this.size.minDimension * 0.34f
        val circleCenter = Offset(this.size.width * 0.42f, this.size.height * 0.42f)
        drawCircle(color = color, radius = circleRadius, center = circleCenter, style = stroke)
        val handleStart = Offset(
            circleCenter.x + circleRadius * 0.74f,
            circleCenter.y + circleRadius * 0.74f,
        )
        val handleEnd = Offset(this.size.width * 0.92f, this.size.height * 0.92f)
        drawLine(color = color, start = handleStart, end = handleEnd, strokeWidth = stroke.width)
    }
}

@Composable
fun StarGlyph(
    filled: Boolean,
    color: Color,
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 16.dp,
) {
    Canvas(modifier = modifier.size(size)) {
        val path = starPath(this.size.width, this.size.height)
        if (filled) {
            drawPath(path, color = color)
        } else {
            drawPath(path, color = color, style = Stroke(width = this.size.minDimension * 0.09f))
        }
    }
}

private fun starPath(width: Float, height: Float): androidx.compose.ui.graphics.Path {
    val cx = width / 2f
    val cy = height / 2f
    val outerRadius = kotlin.math.min(width, height) / 2f * 0.96f
    val innerRadius = outerRadius * 0.42f
    val path = androidx.compose.ui.graphics.Path()
    val points = 5
    val angleStep = Math.PI / points
    var angle = -Math.PI / 2
    path.moveTo(cx + (outerRadius * kotlin.math.cos(angle)).toFloat(), cy + (outerRadius * kotlin.math.sin(angle)).toFloat())
    for (i in 1 until points * 2) {
        angle += angleStep
        val radius = if (i % 2 == 0) outerRadius else innerRadius
        path.lineTo(cx + (radius * kotlin.math.cos(angle)).toFloat(), cy + (radius * kotlin.math.sin(angle)).toFloat())
    }
    path.close()
    return path
}
