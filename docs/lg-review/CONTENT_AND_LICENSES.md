# Demonstration content and attribution

The LG review account receives an isolated catalog containing no customer or reseller content.

## Apple HLS developer stream

- Purpose: live/HLS playback, adaptive variants, audio, and subtitle/caption behavior when exposed by the platform.
- Source: Apple Developer HLS Examples.
- URL: `https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8`
- Use: quality-assurance playback demonstration only.

## Big Buck Bunny

- Producer: Blender Foundation / Blender Institute.
- Project: Peach Open Movie.
- Attribution displayed in the catalog: `© Blender Foundation — peach.blender.org — CC BY 3.0`.
- Playback copy used by the QA catalog: `video.blender.org` official object storage MP4 (480p). A prior Google-hosted sample (`storage.googleapis.com/gtv-videos-bucket`) returned HTTP 403 and was replaced.

## Sintel

- Producer: Blender Foundation / Blender Institute.
- Project: Durian Open Movie.
- License: Creative Commons Attribution 3.0, as published by the official Sintel project.
- Attribution displayed in the catalog: `© Blender Foundation — sintel.org — CC BY 3.0`.
- Playback copy used by the QA catalog: `video.blender.org` official object storage MP4 (480p). A prior Google-hosted sample (`storage.googleapis.com/gtv-videos-bucket`) returned HTTP 403 and was replaced.

## Operational rule

These URLs are used only by the official review profile. They are not offered as a customer content service and are not mixed with commercial playlists.

## Reachability check (2026-10-09)

Verified live in a real browser (not just a status check): all three demo sources load and actually play back frames.

- Apple HLS (`master.m3u8` and its variant playlists/segments): HTTP 200/206, adaptive variants (v2/v3/v5) and audio segments all loaded and the BipBop test pattern played with an advancing timestamp.
- Big Buck Bunny MP4: HTTP 200/206 (range requests supported), played past the title card.
- Sintel MP4: HTTP 200/206, played past the title card.
- Catalog thumbnail SVGs (`live-demo.svg`, `big-buck-bunny.svg`, `sintel.svg`) at `conecta-five-iota.vercel.app/lg-review/assets/`: HTTP 200.
- Review portal (`conecta-five-iota.vercel.app/lg-review.html`): loads the sign-in/activation UI correctly.
