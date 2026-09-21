# Collection Atlas

A local museum search platform with multiple database selection, live metadata retrieval, an image index, and CLIP similarity ranking. Open this folder in VS Code with **File → Open Folder**.

## Run locally

Requires Node.js 20.19 or newer (tested with Node 24 on macOS).

```sh
npm install
npm run setup:models
npm run dev
```

Open http://127.0.0.1:5173/. Stop with Ctrl+C. Use `npm run dev -- --port 5174` if needed. Dependencies and CLIP models are already installed on this Mac. The initial model download requires internet and several hundred MB of disk space; inference runs locally without an AI API key.

## Search

Select one museum, several, **all databases**, or **Select connected**. Enter a query and click **Search artworks**. Use original-language keywords when appropriate, such as 龍 for the National Palace Museum. Museum APIs do not share a translated vocabulary.

- **CLIP** ranks imported images against text, uploaded reference images, or both. Multiple reference embeddings are averaged. “Find similar” searches using an existing artwork.
- **Metadata** searches museum records and locally indexed metadata without visual inference.
- **Color / pixels** compares resized image pixels; a reference image is required.
- Cosine, Euclidean, and Manhattan distances are implemented. Results can be combined or grouped by museum, with a total limit across selected museums.
- Cards include artwork details, original record links, rights, and attribution.
- Source coverage shows successful imports, unavailable sources, and errors. Searches can be cancelled; changing the query or scope marks old results as stale.

**Visual search covers the local index, not the museums’ entire holdings.** Each query imports a bounded candidate batch (8–25 records per connected source), then searches all cached images from the selected museums. Source results can contain fewer reusable images than requested. The index grows as you search; collection-wide discovery would require a larger ingestion pipeline. General CLIP is less reliable for some non-English queries and specialized art-historical comparisons.

## Museum connections

| Source | Current connection |
| --- | --- |
| National Palace Museum, Taipei | Live public open-data catalog; low-resolution CC0 images, CC BY 4.0 text |
| National Gallery of Denmark (SMK) | Live public API; public-domain images and Danish / English metadata |
| Minneapolis Institute of Art (Mia) | Live collection search; public-domain images, including Asian art |
| Rijksmuseum | Live keyless Linked Art API; reusable images only |
| Metropolitan Museum of Art | Live Collection API v1.1; public-domain images only |
| Art Institute of Chicago | Live API; public-domain images only |
| Cleveland Museum of Art | Live Open Access API; CC0 images only |
| Smithsonian | Adapter implemented; requires `SMITHSONIAN_API_KEY`, not authenticated/tested here |
| e-Museum, Korea | Requires `EMUSEUM_API_KEY` and authenticated adapter validation; not connected |
| ColBase, Japan | Public API returned HTTP 403 during verification; not connected |
| MoMA, Getty | Listed for future expansion; image adapters not connected |

“All connected databases” selects only working connections. Sources needing keys, permission, or adapter work appear in the collapsed “Potential databases” section and cannot be selected for search. VGG19 and pose-based search remain disabled because those models are not installed.

Optional credentials belong in a local `.env` file (see `.env.example`), never in `dist`. Restart the server after changing them. Museum API availability and catalog formats can change; Taipei uses a public website endpoint that may require adapter maintenance.

## Files and data

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/styles.css` | Editable page and design |
| `dist/app.js`, `dist/catalog.js` | Interface behavior and source selection |
| `server/sources.js` | Museum retrieval adapters |
| `server/search.js` | Search jobs, persistent index, and ranking |
| `server/embeddings.js` | Local CLIP and pixel embeddings |
| `server/remote.js` | Restricted remote requests |
| `scripts/serve.mjs` | Local Node server and API |
| `data/index-v1.json`, `data/images/` | Cached metadata, embeddings, and museum images |
| `data/models/` | Downloaded CLIP model files |

The `dist` directory contains authored files, not generated output. Refresh after frontend edits; restart after server edits. Data and credentials are ignored by Git. Uploaded references are resized in the browser and sent only to the local server for transient processing; they are not saved into the museum index or sent to museums. Text queries are sent to selected connected museum services. Browser storage remembers scope and settings, not uploads or queries.

## Verification

```sh
npm run check
npm test
```

This app runs only on your Mac. It has not been published. It requires a Node backend and cannot be deployed as a static `dist` folder. A public deployment would need durable storage, resource limits, authentication where appropriate, and an ingestion service sized for its users.

The top brand banner has been removed. Connection status and the local index count appear in the museum sidebar. Museum selection now lists 19 databases, with 8 connected without API keys. Existing saved selections are preserved; choose **Select connected museums** to include the new sources.

New adapter references: [SMK API](https://api.smk.dk/api/v1/docs/), [Mia search API](https://github.com/artsmia/collection-elasticsearch), [Mia open access](https://github.com/artsmia/collection-info/blob/gh-pages/open-access.md).

## Asian collection expansion

See [ASIAN-SOURCES.md](ASIAN-SOURCES.md) for access checks, reuse terms, remaining blockers and code locations. The National Art Museums of Japan union catalog is connected for explicitly downloadable NoC-CR images. Other new Asian catalogs have official links and accurate permission/access status; they do not contribute images until access and reuse requirements are resolved.

## Public hosting

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Render deployment configuration, persistent storage, and public server settings. The project remains local by default.

## Multilingual visual search

In **Advanced search → Search method**, choose **Multilingual text + images (CLIP)** to search in Chinese (simplified/traditional), Japanese, Korean, English, and other languages supported by the model. The original CLIP option remains available for comparison; existing preferences are preserved.

The pinned `sentence-transformers/clip-ViT-B-32-multilingual-v1` text model uses masked mean pooling and its learned 768-to-512 projection, then normalization. It is aligned to CLIP ViT-B/32 and shares the existing quantized image index. Official ONNX weights and projection weights are cached locally; the first load requires a download. See the [model card and Apache-2.0 license](https://huggingface.co/sentence-transformers/clip-ViT-B-32-multilingual-v1).

Candidate retrieval preserves the original query and adds a small curated glossary of English and Asian art terms where recognized. This is not general machine translation. Search coverage lists the queries actually used. Original metadata and image attribution are retained, and visual ranking uses the original query. No matching glossary term means no automatic translation. The search still covers imported images, not all museum holdings.

Run `node scripts/evaluate-multilingual.mjs` to compare 12 queries in four languages against the local image index. It writes `research/multilingual-evaluation.json` with rankings, consistency with English CLIP, latency, and process memory. These are engineering checks, not human-labeled relevance scores. AI processing continues on the Mac behind the temporary tunnel for the current Vercel deployment.
