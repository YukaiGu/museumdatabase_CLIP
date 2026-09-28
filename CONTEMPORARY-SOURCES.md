# Modern and contemporary AI-search sources

Added September 27, 2026 to the original Node/CLIP app (not the offline iPad edition).

## Whitney: official API

Whitney is connected through https://whitney.org/api/artworks, documented at https://whitney.org/about/website/api. It supports all original visual-search modes. Each search checks up to three pages and imports at most 25 image records. Searches cover title, artist, medium and description; empty searches use popularity order. Missing images, virtual works and portfolio containers are excluded. The existing local index also participates in AI ranking. This is not a full-collection image index.

The API permits personal/noncommercial educational use with notices and attribution retained. Images are **not CC0**. Full API captions, including third-party copyright notices, remain in artwork details. This adapter is intended for the personal research app; its image permissions should not be presented as an unrestricted public image library.

Live validation: a Frank Stella query returned 119 catalog matches, imported 25 image records over two pages, computed 25 CLIP vectors, and returned ranked results including Silverstone, Pergusa Three and Coxuria.

## Wikimedia-backed sources

- **MoMA** — Wikidata collection Q188740. Replaces the earlier unavailable entry.
- **Tate** — Wikidata collection Q430682.
- **Centre Pompidou / Musée National d’Art Moderne** — Wikidata collection Q1895953.

These use Wikidata collection membership (P195) and Wikimedia Commons images. They are **not official museum API integrations, full database exports, or complete contemporary-art inventories**. Museum catalog links remain available in access details. Each artwork’s details identify the data provider and link to its Wikidata record; image-source and license URLs are retained with attribution.

The candidate query retrieves at most 160 rows dated 1900 onward, newest first, and restricts direct artwork types to paintings, sculptures, photographs, and installation art. It deduplicates works, then matches query words against title, creator, date, and type. Missing dates, other object types, unrepresented works, and images unavailable on Commons are not covered. Rows can include alternate photographs, casts, or installation views, which are disclosed in the record description. Collection assignments are community-maintained and can contain errors.

Only JPEG/PNG/WebP images with explicit CC0, Public Domain, CC BY, or CC BY-SA metadata pass the license check. NC/ND licences, unknown/mismatched licences, and additional restrictions are excluded. Image credit, license URL, file-page URL, and a resize/recompression notice are preserved. Adapted BY-SA images retain the same license. No museum website is scraped and no access challenge is bypassed.

All original image-search modes remain available: CLIP, multilingual text + CLIP, and color/pixel matching with a reference image. Images go through the existing download, normalization, embedding, and ranking pipeline. Keyword retrieval supplies a limited candidate set; similarity search does not search a whole museum collection. An empty keyword match may trigger the original app’s starting-selection behavior, as disclosed in Source coverage.

## Validation

- 30 tests pass, including strict image-license handling, malformed/missing images, collection identity, duplicate removal, attribution, and adapter integration.
- Live retrieval and image decoding succeeded for all three sources. Examples: MoMA’s *Lumumba* (2000), Tate’s *The Badminton Game* (1972), and MNAM’s *La Création, les filles de Leucippe* (1981).
- No credentials or paid hosting are needed for these public Wikimedia endpoints. Wikimedia requests are serialized with a one-second gap. HTTP 429 applies a shared cooldown honoring Retry-After (at least 60 seconds); queued requests fail clearly rather than hammering the provider. Availability remains subject to provider rate limits and timeouts.

## References

- https://www.wikidata.org/wiki/Q188740
- https://www.wikidata.org/wiki/Q430682
- https://www.wikidata.org/wiki/Q1895953
- https://www.wikidata.org/wiki/Wikidata:Licensing
- https://commons.wikimedia.org/wiki/Commons:API/MediaWiki
- https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia

Implementation: `server/contemporary.js`, registered by `server/sources.js`; museum labels in `dist/catalog.js`; tests in `tests/contemporary.test.mjs`.

## MoMA diagnosis and repairs

MoMA’s official API at https://api.moma.org/ is restricted to staff and partners. Its CC0 GitHub metadata excludes images. The existing MoMA connector uses Commons, not that API. The UI now explicitly labels MoMA, Tate and Pompidou as limited image subsets.

Removed the premature 50-candidate license-check cutoff: the adapter can now examine its entire bounded 160-row selection before concluding there are no more eligible images. Visual searches with no keyword candidates can replenish a small local starting selection instead of becoming stuck after the first indexed record. Keyword metadata search remains literal. Source notes disclose fallback selection and remote failures.

Mac and iPad listeners can run in one process, sharing one queue and index. Optional LAN_HOST and LAN_PORT activate the second listener; ADDITIONAL_PUBLIC_ORIGINS must contain its exact URL. The Wi-Fi address can change after reconnecting.
