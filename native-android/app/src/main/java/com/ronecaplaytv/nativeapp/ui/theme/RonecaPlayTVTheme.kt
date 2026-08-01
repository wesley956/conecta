package com.ronecaplaytv.nativeapp.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Shapes
import androidx.compose.foundation.shape.RoundedCornerShape
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

data class RonecaColorScheme(
    val background: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val border: Color,
    val primary: Color,
    val secondary: Color,
    val tertiary: Color,
    val success: Color,
    val warning: Color,
    val error: Color,
    val textPrimary: Color,
    val textBody: Color,
    val textSecondary: Color,
    val textDisabled: Color,
)

private val DarkRonecaColors = RonecaColorScheme(
    background = RonecaColors.Background,
    surface = RonecaColors.Surface,
    surfaceRaised = RonecaColors.SurfaceRaised,
    border = RonecaColors.Border,
    primary = RonecaColors.Primary,
    secondary = RonecaColors.Purple,
    tertiary = RonecaColors.Orange,
    success = RonecaColors.Green,
    warning = RonecaColors.Yellow,
    error = RonecaColors.Error,
    textPrimary = RonecaColors.TextPrimary,
    textBody = RonecaColors.BodyText,
    textSecondary = RonecaColors.TextSecondary,
    textDisabled = RonecaColors.TextDisabled,
)

private val LocalRonecaColors = staticCompositionLocalOf { DarkRonecaColors }

object RonecaTheme {
    val colors: RonecaColorScheme
        @Composable get() = LocalRonecaColors.current
}

@Composable
fun RonecaPlayTVTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalRonecaColors provides DarkRonecaColors) {
        MaterialTheme(
            shapes = Shapes(
                small = RoundedCornerShape(8.dp),
                medium = RoundedCornerShape(12.dp),
                large = RoundedCornerShape(24.dp),
            ),
            content = content,
        )
    }
}
