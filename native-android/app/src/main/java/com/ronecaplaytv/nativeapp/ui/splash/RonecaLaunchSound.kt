package com.ronecaplaytv.nativeapp.ui.splash

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.tanh

/**
 * Assinatura sonora original do ronecaPlayer TV.
 *
 * A sequência curta combina três notas ascendentes, um brilho uma oitava acima
 * e um impacto grave final. O áudio é sintetizado localmente para manter a
 * identidade da marca independente de arquivos ou serviços externos.
 */
internal class RonecaLaunchSound {
    private var audioTrack: AudioTrack? = null

    fun play() {
        release()

        val samples = buildSignature()
        val minimumBufferSize = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = maxOf(samples.size * Short.SIZE_BYTES, minimumBufferSize)

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(bufferSize)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
            .also { track ->
                track.write(samples, 0, samples.size)
                track.setVolume(0.62f)
                track.play()
            }
    }

    fun release() {
        audioTrack?.let { track ->
            runCatching { track.stop() }
            track.release()
        }
        audioTrack = null
    }

    private fun buildSignature(): ShortArray {
        val samples = ShortArray((DURATION_SECONDS * SAMPLE_RATE).toInt())
        val notes = listOf(
            Note(frequency = 164.81, startsAt = 0.00, duration = 0.78, gain = 0.26),
            Note(frequency = 246.94, startsAt = 0.26, duration = 0.72, gain = 0.22),
            Note(frequency = 369.99, startsAt = 0.56, duration = 0.86, gain = 0.24),
            Note(frequency = 739.99, startsAt = 0.65, duration = 0.92, gain = 0.10),
            Note(frequency = 82.41, startsAt = 0.90, duration = 0.70, gain = 0.20),
        )

        for (sampleIndex in samples.indices) {
            val time = sampleIndex.toDouble() / SAMPLE_RATE
            var mixed = 0.0

            notes.forEach { note ->
                val localTime = time - note.startsAt
                if (localTime in 0.0..note.duration) {
                    val envelope = note.envelopeAt(localTime)
                    val fundamental = sin(2.0 * PI * note.frequency * localTime)
                    val warmHarmonic = sin(4.0 * PI * note.frequency * localTime) * 0.12
                    mixed += (fundamental + warmHarmonic) * envelope * note.gain
                }
            }

            val softened = tanh(mixed * 1.35) * MASTER_GAIN
            samples[sampleIndex] = (softened * Short.MAX_VALUE)
                .toInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                .toShort()
        }

        return samples
    }

    private data class Note(
        val frequency: Double,
        val startsAt: Double,
        val duration: Double,
        val gain: Double,
    ) {
        fun envelopeAt(localTime: Double): Double {
            val attack = (localTime / ATTACK_SECONDS).coerceIn(0.0, 1.0)
            val releaseStart = duration * 0.58
            val release = if (localTime <= releaseStart) {
                1.0
            } else {
                exp(-5.0 * (localTime - releaseStart) / (duration - releaseStart))
            }
            return attack * release
        }
    }

    private companion object {
        const val SAMPLE_RATE = 48_000
        const val DURATION_SECONDS = 1.75
        const val ATTACK_SECONDS = 0.025
        const val MASTER_GAIN = 0.78
    }
}
