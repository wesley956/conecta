# LG-07 — Recovery policy

This branch implements the recovery architecture approved for RonecaPlayTV webOS:

1. classify the failure;
2. retry the same source only for transient failures with 2s / 4s / 8s backoff;
3. switch to the next source from the same content before commercial failover;
4. switch playlist only after local sources are exhausted;
5. resolve the same logical content on the backup catalog;
6. preserve VOD position while live content returns to live edge;
7. keep a single recovery in flight;
8. require 8 seconds plus at least 2 seconds of real playback progress before confirming recovery;
9. mark playlist health success only after stable playback;
10. keep diagnostic identifiers opaque and never include content keys or URLs.

Physical LG validation remains required before Stable/LG-10.
