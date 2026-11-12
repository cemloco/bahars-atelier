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

Editorial Flatlay (development branch only):

- `npm test` includes alpha-bound analysis, the six requested outfit combinations
  in four deterministic variants, bounds/collision checks, unusual aspect ratios,
  repeated categories, locks, and an editorial/legacy sync round trip. All cloud
  tests use the existing in-memory SQLite/KV fixture, never a deployed database.
- `node tests/browser-editorial.cjs` uses the installed Playwright and Chromium.
  It exercises the actual mobile UI for all six combinations: native touch drag,
  resize/rotation controls, rearranging, add/remove, save/reopen, export, preserved
  legacy garments/photos/calendar, and copying instead of overwriting a saved
  editorial look. Two fresh mobile browser contexts restore an eight-piece look
  through the existing sync client and endpoint backed by the isolated fixture.
  Screenshots and 1800 × 2160 PNG exports go to ignored `work/`.

The active application is the inline script in `index.html`; the older standalone
`app.js` is not loaded. `editorial-layout.js` is a dependency-free browser script
with pure geometry helpers usable from Node. Editorial layer `crop` values are
normalized source-image bounds and include the visible aspect ratio; source
images remain unchanged. Existing `mode`, `layers` and `theme` persistence carries
these fields through the existing cloud endpoint. `layoutVersion: 1` and
`layoutVariant` identify new editorial compositions; no database migration or
rewrite of older looks is performed. Saving in Auto-Layout creates a new look.

Auto-Layout uses category/subcategory roles, aspect ratios, alpha bounds, a
free-space search with rotated bounding boxes, and common scale reduction when
needed. Four art-directed target sets provide variants; these are preferences,
not fixed coordinates. Locked items retain their position; a locked item outside
the safe area produces an actionable error instead of silently moving it.
Completely transparent or unreadable photos fail without removing any layers.
Opaque photo backgrounds remain visible. There is no automatic background
removal and no AI service. The export is an unbranded beige PNG with alpha-shaped
shadows; the saved preview stays at 900 × 1080 to limit sync payload size.

These fixtures establish behavior and geometry, not subjective quality with the
user's actual wardrobe. Physical iPhone/Safari, native iOS sharing, live Cloudflare
publication, and a real second iPhone still require verification on the test site.

Auto-Layout 2.0 adds category-specific size caps (top +21%, pants +16–18%,
shoes +37%, bags +16–19%) before aspect-ratio fitting and packing retries.
Left/Right use mirrored targets, Compact uses nearly straight garments and a
stronger compactness score, Magazine uses larger rotations. Scoring combines
category targets, garment distance, main-group centre, area-weighted balance,
unused bounding-envelope area, edge clearance and overlap cost. Belts prefer
the trouser waist. Only top/bottom pairs and Magazine bags next to larger pieces
may intersect, capped at 4% of the smaller rotated bounding rectangle per pair;
locked pieces and small details retain clearance. This conservative rectangle
budget does not claim pixel-level silhouette collision detection.

The 70–85% utilization regression measures the outfit's bounding envelope for
three representative pieces, not opaque-pixel coverage. Other shapes/counts
adapt to available space; locked items can prevent an ideal composition.
The mobile browser regression cycles all four variants for every combination
and checks bounds and button separation. It compares the CSS preview with the
downloaded PNG at mobile resolution (mean RGB error below 5/255, excluding
the outer three pixels). It also retains touch editing,
save/reopen, export and isolated cloud hydration checks. Softer alpha shadows
use matching CSS/Canvas parameters; PWA shell cache and module URL are v2.
Physical Safari/iPhone testing and appraisal with actual wardrobe images remain
manual checks; automated fixtures use synthetic transparent garment silhouettes.
