Run `npm test` with Node 24+. Tests use an in-memory SQLite database with the columns
used by the existing sync endpoint, and a fake KV binding; no real user data is used.
The fixture contains 53 garments, embedded PNGs, one linked look with preview and
realPhoto, and one calendar entry. Checks cover idempotency, conflicting IDs,
tombstones, partial upload failure/retry, KV propagation delay, linked records,
size limits, authentication, origin checking and unchanged backup objects.

`node tests/browser-import.cjs` additionally requires Playwright and Chromium
(`/usr/bin/chromium`). It runs the real UI at 390 × 844 with touch enabled against
the import handlers and the test database. It checks preview before any writes,
a large transparent PNG compressed to WebP, upload interruption/resume, final
53 garment/image verification and mobile overflow. This is Chromium emulation,
not a physical iPhone/Safari test.

Cloud setup: use the existing ATELIER_DB (D1), ATELIER_IMAGES (KV), login password
and session secret bindings on the cloud-sync-test Pages preview. No schema
migration is needed. Deploying the branch deploys `/api/import` alongside `/api/sync`.
The importer never updates or deletes existing records, clears tombstones, or
writes to the local wardrobe database. Conflicting IDs are reported and skipped.
Interrupted imports resume by selecting the same original JSON file: each ID and
canonical SHA-256 is checked again on the server, so a lost POST response is safe.
A new file selection always requires a fresh preview confirmation.

Each request contains one record (maximum 3.3 MB). Each image is limited to
2.5 million ASCII characters, well below KV's 25 MiB value limit; metadata is
limited to 90 KB for D1. New images use immutable content-addressed KV keys and
existing keys are reused to avoid repeated writes against KV's one-write-per-key-
per-second limit. Missing/eventually consistent KV values fail verification and
allow a later retry. No completion is claimed solely from a POST response.
An unsuccessful image write or a concurrent ID conflict may leave an unreferenced
content-addressed image; it is deliberately not deleted automatically.

Automatic sync pauses when the import dialog opens and remains paused across
reloads. After reviewing import results, “Jetzt synchronisieren” explicitly resumes
the existing automatic sync and its timestamp conflict policy. This may then change
the local wardrobe in the usual way. The original file is never written to.
Live D1/KV verification happens when the user performs the import on the configured
preview; the automated tests do not claim to have imported the user's actual backup.
