package com.ronecaplaytv.nativeapp.catalog

import android.util.JsonReader
import android.util.JsonToken
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets

object CatalogJsonParser {
    fun readChannels(input: InputStream): List<NativeChannel> =
        reader(input).use { json ->
            val channels = ArrayList<NativeChannel>()
            json.beginObject()
            while (json.hasNext()) {
                when (json.nextName()) {
                    "channels" -> {
                        json.beginArray()
                        while (json.hasNext()) {
                            readChannel(json)?.let(channels::add)
                        }
                        json.endArray()
                    }
                    else -> json.skipValue()
                }
            }
            json.endObject()
            channels
        }

    fun readMovies(input: InputStream): List<NativeMovie> =
        reader(input).use { json ->
            val movies = ArrayList<NativeMovie>()
            json.beginObject()
            while (json.hasNext()) {
                when (json.nextName()) {
                    "movies" -> {
                        json.beginArray()
                        while (json.hasNext()) {
                            readMovie(json)?.let(movies::add)
                        }
                        json.endArray()
                    }
                    else -> json.skipValue()
                }
            }
            json.endObject()
            movies
        }

    fun readSeries(input: InputStream): List<NativeSeries> =
        reader(input).use { json ->
            val series = ArrayList<NativeSeries>()
            json.beginObject()
            while (json.hasNext()) {
                when (json.nextName()) {
                    "series" -> {
                        json.beginArray()
                        while (json.hasNext()) {
                            readSeriesItem(json)?.let(series::add)
                        }
                        json.endArray()
                    }
                    else -> json.skipValue()
                }
            }
            json.endObject()
            series
        }

    private fun readChannel(json: JsonReader): NativeChannel? {
        var id = ""
        var name = ""
        var groupTitle = "Canais"
        var logoUrl: String? = null
        var primaryUrl = ""
        var playbackUrls = emptyList<String>()

        json.beginObject()
        while (json.hasNext()) {
            when (json.nextName()) {
                "id" -> id = json.nextSafeString().orEmpty()
                "name" -> name = json.nextSafeString().orEmpty()
                "groupTitle" -> groupTitle = json.nextSafeString() ?: "Canais"
                "logo" -> logoUrl = json.nextSafeString()
                "url" -> primaryUrl = json.nextSafeString().orEmpty()
                "playbackUrls" -> playbackUrls = json.readStringArray()
                else -> json.skipValue()
            }
        }
        json.endObject()

        val urls = playbackUrls.ifEmpty { listOfNotNull(primaryUrl.takeIf(String::isNotBlank)) }
        val selectedUrl = primaryUrl.takeIf(String::isNotBlank) ?: urls.firstOrNull().orEmpty()
        if (id.isBlank() || name.isBlank() || selectedUrl.isBlank()) return null

        return NativeChannel(
            id = id,
            name = name,
            groupTitle = groupTitle,
            logoUrl = logoUrl,
            primaryUrl = selectedUrl,
            playbackUrls = urls.distinct(),
        )
    }

    private fun readMovie(json: JsonReader): NativeMovie? {
        var id = ""
        var name = ""
        var year: Int? = null
        var duration: String? = null
        var synopsis: String? = null
        var coverUrl: String? = null
        var category = "Filmes"
        var primaryUrl = ""
        var playbackUrls = emptyList<String>()

        json.beginObject()
        while (json.hasNext()) {
            when (json.nextName()) {
                "id" -> id = json.nextSafeString().orEmpty()
                "name" -> name = json.nextSafeString().orEmpty()
                "year" -> year = json.nextSafeInt()
                "duration" -> duration = json.nextSafeString()
                "synopsis" -> synopsis = json.nextSafeString()
                "cover" -> coverUrl = json.nextSafeString()
                "category" -> category = json.nextSafeString() ?: "Filmes"
                "url" -> primaryUrl = json.nextSafeString().orEmpty()
                "playbackUrls" -> playbackUrls = json.readStringArray()
                else -> json.skipValue()
            }
        }
        json.endObject()

        val urls = playbackUrls.ifEmpty { listOfNotNull(primaryUrl.takeIf(String::isNotBlank)) }
        val selectedUrl = primaryUrl.takeIf(String::isNotBlank) ?: urls.firstOrNull().orEmpty()
        if (id.isBlank() || name.isBlank() || selectedUrl.isBlank()) return null

        return NativeMovie(
            id = id,
            name = name,
            year = year?.takeIf { it > 0 },
            duration = duration,
            synopsis = synopsis,
            coverUrl = coverUrl,
            category = category,
            primaryUrl = selectedUrl,
            playbackUrls = urls.distinct(),
        )
    }

    private fun readSeriesItem(json: JsonReader): NativeSeries? {
        var id = ""
        var name = ""
        var coverUrl: String? = null
        var category = "Séries"
        var synopsis: String? = null
        var seasons = emptyList<NativeSeason>()
        var xtreamSeriesId: String? = null

        json.beginObject()
        while (json.hasNext()) {
            when (json.nextName()) {
                "id" -> id = json.nextSafeString().orEmpty()
                "name" -> name = json.nextSafeString().orEmpty()
                "cover" -> coverUrl = json.nextSafeString()
                "category" -> category = json.nextSafeString() ?: "Séries"
                "synopsis" -> synopsis = json.nextSafeString()
                "seasons" -> seasons = json.readSeasons()
                "xtreamSeriesId" -> xtreamSeriesId = json.nextSafeString()
                else -> json.skipValue()
            }
        }
        json.endObject()

        if (id.isBlank() || name.isBlank()) return null
        return NativeSeries(
            id = id,
            name = name,
            coverUrl = coverUrl,
            category = category,
            synopsis = synopsis,
            seasons = seasons.sortedBy(NativeSeason::number),
            xtreamSeriesId = xtreamSeriesId,
        )
    }

    private fun JsonReader.readSeasons(): List<NativeSeason> {
        if (peek() == JsonToken.NULL) {
            nextNull()
            return emptyList()
        }

        val seasons = ArrayList<NativeSeason>()
        beginArray()
        while (hasNext()) {
            var number = 0
            var episodes = emptyList<NativeEpisode>()
            beginObject()
            while (hasNext()) {
                when (nextName()) {
                    "number" -> number = nextSafeInt() ?: 0
                    "episodes" -> episodes = readEpisodes()
                    else -> skipValue()
                }
            }
            endObject()
            if (number > 0) seasons += NativeSeason(number, episodes.sortedBy(NativeEpisode::number))
        }
        endArray()
        return seasons
    }

    private fun JsonReader.readEpisodes(): List<NativeEpisode> {
        if (peek() == JsonToken.NULL) {
            nextNull()
            return emptyList()
        }

        val episodes = ArrayList<NativeEpisode>()
        beginArray()
        while (hasNext()) {
            var id = ""
            var number = 0
            var name = ""
            var duration: String? = null
            var primaryUrl = ""
            var playbackUrls = emptyList<String>()

            beginObject()
            while (hasNext()) {
                when (nextName()) {
                    "id" -> id = nextSafeString().orEmpty()
                    "number" -> number = nextSafeInt() ?: 0
                    "name" -> name = nextSafeString().orEmpty()
                    "duration" -> duration = nextSafeString()
                    "url" -> primaryUrl = nextSafeString().orEmpty()
                    "playbackUrls" -> playbackUrls = readStringArray()
                    else -> skipValue()
                }
            }
            endObject()

            val urls = playbackUrls.ifEmpty { listOfNotNull(primaryUrl.takeIf(String::isNotBlank)) }
            val selectedUrl = primaryUrl.takeIf(String::isNotBlank) ?: urls.firstOrNull().orEmpty()
            if (id.isNotBlank() && name.isNotBlank() && selectedUrl.isNotBlank()) {
                episodes += NativeEpisode(
                    id = id,
                    number = number.coerceAtLeast(1),
                    name = name,
                    duration = duration,
                    primaryUrl = selectedUrl,
                    playbackUrls = urls.distinct(),
                )
            }
        }
        endArray()
        return episodes
    }

    private fun JsonReader.readStringArray(): List<String> {
        if (peek() == JsonToken.NULL) {
            nextNull()
            return emptyList()
        }

        val values = ArrayList<String>()
        beginArray()
        while (hasNext()) {
            nextSafeString()?.takeIf(String::isNotBlank)?.let(values::add)
        }
        endArray()
        return values
    }

    private fun JsonReader.nextSafeString(): String? = when (peek()) {
        JsonToken.NULL -> {
            nextNull()
            null
        }
        JsonToken.STRING, JsonToken.NUMBER, JsonToken.BOOLEAN -> nextString().trim().takeIf { it.isNotEmpty() }
        else -> {
            skipValue()
            null
        }
    }

    private fun JsonReader.nextSafeInt(): Int? = nextSafeString()?.toIntOrNull()

    private fun reader(input: InputStream) = JsonReader(
        InputStreamReader(input, StandardCharsets.UTF_8),
    ).apply {
        isLenient = false
    }
}
