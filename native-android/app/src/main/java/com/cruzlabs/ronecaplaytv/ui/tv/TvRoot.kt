package com.cruzlabs.ronecaplaytv.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

@Composable
fun TvRoot() {
    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF05070B))
                .padding(horizontal = 72.dp, vertical = 48.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "RonecaPlayTV Nativo",
                style = MaterialTheme.typography.displayMedium,
            )
            Text(
                text = "Interface TV preparada para DPAD, foco e Media3 ExoPlayer.",
                modifier = Modifier.padding(top = 18.dp),
                style = MaterialTheme.typography.titleLarge,
            )
        }
    }
}
