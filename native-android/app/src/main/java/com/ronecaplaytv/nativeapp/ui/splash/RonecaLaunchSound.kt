package com.ronecaplaytv.nativeapp.ui.splash

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.tanh

/**
 * Assinatura sonora original da RonecaPlayTV.
 *
 * O impacto grave abre a marca, três notas ascendentes acompanham a aparição
 * da logo e um brilho final deixa uma cauda cinematográfica de três segundos.
 * Tudo é sintetizado localmente, sem depender de arquivos ou serviços externos.
 */
internal class RonecaLaunchSound {
    private var audioTrack: AudioTrack? = null

    suspend fun play() {
        release()

        val samples = withContext(Dispatchers.Default) { buildSignature() }
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
                track.setVolume(0.72f)
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
            Note(frequency = 73.42, startsAt = 0.05, duration = 1.45, gain = 0.32),
            Note(frequency = 146.83, startsAt = 0.38, duration = 1.20, gain = 0.24),
            Note(frequency = 220.00, startsAt = 0.72, duration = 1.20, gain = 0.23),
            Note(frequency = 293.66, startsAt = 1.04, duration = 1.45, gain = 0.27),
            Note(frequency = 587.33, startsAt = 1.30, duration = 1.55, gain = 0.12),
            Note(frequency = 73.42, startsAt = 1.48, duration = 1.45, gain = 0.22),
        )

        for (sampleIndex in samples.indices) {
            val time = sampleIndex.toDouble() / SAMPLE_RATE
            var mixed = cinematicImpact(time) + risingAir(time)

            notes.forEach { note ->
                val localTime = time - note.startsAt
                if (localTime in 0.0..note.duration) {
                    val envelope = note.envelopeAt(localTime)
                    val fundamental = sin(2.0 * PI * note.frequency * localTime)
                    val warmHarmonic = sin(4.0 * PI * note.frequency * localTime) * 0.16
                    val presence = sin(6.0 * PI * note.frequency * localTime) * 0.045
                    mixed += (fundamental + warmHarmonic + presence) * envelope * note.gain
                }
            }

            val softened = tanh(mixed * 1.55) * MASTER_GAIN
            samples[sampleIndex] = (softened * Short.MAX_VALUE)
                .toInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                .toShort()
        }

        return samples
    }

    private fun cinematicImpact(time: Double): Double {
        if (time !in 0.0..0.92) return 0.0
        val bassEnvelope = exp(-4.6 * time)
        val bassSweep = sin(2.0 * PI * (92.0 * time - 25.0 * time * time)) * 0.52
        val transientEnvelope = exp(-34.0 * time)
        val transient =
            (sin(2.0 * PI * 1_730.0 * time) + sin(2.0 * PI * 2_410.0 * time)) *
                transientEnvelope *
                0.085
        return bassSweep * bassEnvelope + transient
    }

    private fun risingAir(time: Double): Double {
        val localTime = time - 0.32
        val duration = 1.90
        if (localTime !in 0.0..duration) return 0.0
        val progress = localTime / duration
        val envelope = sin(PI * progress).coerceAtLeast(0.0)
        val frequency = 180.0 + 360.0 * progress
        return sin(2.0 * PI * frequency * localTime) * envelope * envelope * 0.055
    }

    private data class Note(
        val frequency: Double,
        val startsAt: Double,
        val duration: Double,
        val gain: Double,
    ) {
        fun envelopeAt(localTime: Double): Double {
            val attack = (localTime / ATTACK_SECONDS).coerceIn(0.0, 1.0)
            val releaseStart = duration * 0.48
            val release = if (localTime <= releaseStart) {
                1.0
            } else {
                exp(-4.2 * (localTime - releaseStart) / (duration - releaseStart))
            }
            return attack * release
        }
    }

    private companion object {
        const val SAMPLE_RATE = 48_000
        const val DURATION_SECONDS = 3.0
        const val ATTACK_SECONDS = 0.018
        const val MASTER_GAIN = 0.90
    }
}
