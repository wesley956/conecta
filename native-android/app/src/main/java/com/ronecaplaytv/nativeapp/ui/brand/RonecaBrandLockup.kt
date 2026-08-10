package com.ronecaplaytv.nativeapp.ui.brand

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Text
import com.ronecaplaytv.nativeapp.R
import com.ronecaplaytv.nativeapp.ui.components.RonecaColors

@Composable
fun RonecaBrandLockup(
    emblemSize: Dp,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
    showEmblem: Boolean = true,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showEmblem) {
            Image(
                painter = painterResource(R.drawable.roneca_player_tv_emblem),
                contentDescription = "Símbolo Roneca Player TV",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .width(emblemSize)
                    .height(emblemSize),
            )
            Spacer(modifier = Modifier.width((emblemSize.value * 0.18f).dp))
        }
        Text(
            text = "Roneca",
            color = RonecaColors.TextPrimary,
            fontSize = fontSize,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
        )
        Spacer(modifier = Modifier.width((fontSize.value * 0.34f).dp))
        Text(
            text = "Player",
            color = RonecaColors.Primary,
            fontSize = fontSize,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
        )
        Spacer(modifier = Modifier.width((fontSize.value * 0.28f).dp))
        Text(
            text = "TV",
            color = RonecaColors.RedStrong,
            fontSize = fontSize,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
        )
    }
}
