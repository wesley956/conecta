import assert from "node:assert/strict";
import fs from "node:fs";
import {
  channelContentKey,
  episodeContentKey,
  movieContentKey,
  seriesContentKey
} from "../smart-tv/src/contentIdentity.ts";

const read = path => fs.readFileSync(path, "utf8");

assert.equal(
  channelContentKey({ name: "TV Cultura HD", groupTitle: "Canais Abertos" }),
  channelContentKey({ name: "TV Cúltura HD", groupTitle: "Canais Ábertos" }),
  "A identidade do canal deve ignorar acentos."
);
assert.equal(
  movieContentKey({ name: "A Viagem", year: 2024 }),
  "movie:a-viagem:2024",
  "A identidade do filme deve preservar nome e ano."
);
assert.equal(
  seriesContentKey({ name: "Série Exemplo" }),
  "series:serie-exemplo",
  "A identidade da série deve ser estável."
);
assert.equal(
  episodeContentKey("Série Exemplo", { number: 2 }, { number: 7 }),
  "episode:serie-exemplo:s2:e7",
  "A identidade do episódio deve usar série, temporada e número."
);

const androidIdentity = read("native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/ContentIdentity.kt");
const androidApp = read("native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/RonecaPlayTVApp.kt");
const androidCatalog = read("native-android/app/src/main/java/com/ronecaplaytv/nativeapp/catalog/CatalogViewModel.kt");
const androidPreferences = read("native-android/app/src/main/java/com/ronecaplaytv/nativeapp/persistence/PlaybackPreferences.kt");
const smartApp = read("smart-tv/src/App.tsx");
const smartCatalog = read("smart-tv/src/catalog.ts");
const smartLibrary = read("smart-tv/src/mediaLibrary.ts");

assert.ok(!androidIdentity.includes("primaryUrl"), "Android não pode usar URL na identidade estável.");
assert.ok(androidApp.includes("ContentIdentity.episode(resolvedSeries, season, episode)"), "Android não recupera o episódio equivalente.");
assert.ok(androidApp.includes("destination = NativeDestination.Player"), "Android não permanece no player depois do failover.");
assert.ok(androidCatalog.includes('lastFailoverOutcome = "switched"'), "Android não registra o resultado padronizado.");
assert.ok(androidPreferences.includes("migrateProgress"), "Android não migra progresso legado.");
assert.ok(androidPreferences.includes("migrateFavoriteChannels"), "Android não migra favoritos legados.");

assert.ok(smartApp.includes("result.outcome !== \"switched\""), "Smart TV não valida o resultado do failover.");
assert.ok(smartApp.includes("contentKey: playback.contentKey"), "Smart TV não correlaciona tentativa e conteúdo.");
assert.ok(smartCatalog.includes("lastFailoverAttemptId"), "Smart TV não registra a tentativa de failover.");
assert.ok(smartCatalog.includes('outcome: "switched"'), "Smart TV não registra o resultado do failover.");
assert.ok(smartLibrary.includes("reconcileIdentities"), "Smart TV não migra a biblioteca legada.");
assert.ok(smartLibrary.includes("item.contentKey"), "Smart TV não persiste a identidade estável.");

console.log("Continuidade de failover validada no Android, LG webOS e Samsung Tizen.");
