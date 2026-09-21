# Asian sources: access and reuse review

Reviewed September 21, 2026. This records published terms and technical checks, not individually granted permission. No museum has been contacted on your behalf.

| Source | App behavior | Evidence / next requirement |
| --- | --- | --- |
| National Art Museums of Japan | Connected; searches the union catalog of five museums. Imports only records with a NoC-CR image marker AND a download button. | [Terms](https://search.artmuseums.go.jp/search_e/terms.html) allow labeled content with attribution, source links and modification disclosure. These are retained. Live record and image retrieval tested. Up to 20 candidates inspected; unlabeled images excluded. |
| Tokyo Museum Collection | Listed, access blocked; official catalog link available. | [API](https://museumcollection.tokyo/developer/) and [terms](https://museumcollection.tokyo/terms/) publish reusable metadata; image licenses must be checked individually. Last direct API request returned 403. Unlabeled collection images are generally third-party content. |
| Palace Museum, Beijing | Listed; reuse review needed, no images imported. | [Copyright statement](https://www.dpm.org.cn/bottom/privacy/236341.html): attribution required, commercial use and modifications require written permission. This app resizes images, so obtain clarification before enabling ingestion. [Image licensing](https://www.dpm.org.cn/bottom/apply_image.html). |
| National Museum of China | Listed; reuse review needed, no images imported. | [Catalog](https://www.chnmuseum.cn/zp/) and [copyright statement](https://www.chnmuseum.cn/shxg/bqsm/). Its copyright statement requires attribution and written permission for modifications and commercial use; bulk access/indexing permission remains unestablished. |
| Shanghai Museum | Listed; reuse review needed, no images imported. | [Terms](https://www.shanghaimuseum.net/mu/frontend/pg/en/infomation/download-claim): attribution required; commercial use and modifications require written permission. Official site is migrating to shanghaimuseum.cn. |
| e-Museum / e国宝, Japan | Listed; permission required, links only. | [Terms](https://emuseum.nich.go.jp/about?langId=en&webView=0) require explicit permission for transfer to other websites, even noncommercial. Request from the holding institution. |
| eMuseum, South Korea | Existing entry; key required plus authenticated adapter validation. | [API guide](https://www.emuseum.go.kr/openApi); [current key application](https://www.data.go.kr/data/15159017/openapi.do). A key enables access, not blanket image reuse; verify each record's rights before indexing. |
| Seoul Museum of Art | Listed; reuse review needed, no images imported. | [Official dataset](https://data.seoul.go.kr/dataList/OA-15321/S/1/datasetView.do) identifies KOGL Type 4 (attribution, noncommercial, no derivatives) and third-party rights. API setup and image-indexing clearance remain outstanding. |

The app's “Access & reuse details” panels link to these official catalogs and terms. Unavailable sources appear under the collapsed “Potential databases” section with their limitations and access links; only connected sources can be selected for search. Eight connections are available without keys among 19 listed databases. Japanese Union Catalog searches preserve the holding museum on each record; they are not five separate source checkboxes.

## Code location

The project was moved to `/Users/guyuanoo/Desktop/collection-atlas` during development. Open that folder in VS Code. `dist/` is the editable interface, `server/` implements retrieval and ranking, `scripts/` starts the app, `tests/` contains checks, and `data/` holds the local image/index/model cache. Backend paths resolve relative to the project, so moving it requires restarting the server.

## Credential setup

Use a local `.env` file based on `.env.example`. Do not put keys in frontend files. eMuseum needs `EMUSEUM_API_KEY`; this alone does not enable the unvalidated adapter. No new API key is required for Japan's National Art Museums catalog.
