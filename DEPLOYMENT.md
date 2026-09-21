# Publish Collection Atlas

This app needs a single long-running Node server with persistent storage. Static hosting alone does not run its API, search queue, CLIP model, or image index.

## Render

1. Sign in to Render and create a Blueprint from https://github.com/YukaiGu/museumdatabase_CLIP.
2. Review `render.yaml`: it proposes a paid 1 CPU / 2 GB service and a 10 GB persistent disk. Confirm the displayed price before deploying. This is a starting configuration, not a benchmarked capacity guarantee.
3. Deploy. Render supplies the public URL automatically; `/api/health` is the health check.
4. Open the URL and test a metadata search, then a CLIP search. The first CLIP search downloads the model to persistent storage and takes longer. Museum availability must be rechecked from the hosting region.
5. Optionally add museum credentials as server environment variables. Never put keys in frontend code or commit `.env`. Existing potential databases stay inactive until their setup and permissions are complete.

The initial cloud index is empty. Personal reference uploads and this Mac's cache are not included in the Docker image or uploaded from this project. The cloud builds its museum index through searches. Browser-resized reference images are sent to the hosted server for transient analysis; museum artwork caches persist on disk.

For a custom domain, set `PUBLIC_ORIGIN` to its exact HTTPS origin and configure the domain in Render. The default Render origin stays allowed. Keep one instance because jobs and the search queue are in memory and the index is a local file. Redeploys interrupt active searches; completed artwork records persist on disk.

The server caps the queue at three jobs and accepts up to 20 search submissions per minute globally. This is an initial small research deployment; monitor memory, storage, and traffic before wider promotion. No hosting resources or paid subscriptions are created by committing these files.

## Local use

`npm ci`, then `npm run dev`. Without deployment environment variables, the server continues to bind only to localhost. `npm run check` and `npm test` verify the code.

## Vercel interface with a temporary Mac backend

`vercel.json` publishes only `dist/` and proxies `/api/*` to the current Cloudflare Quick Tunnel. The repository's normal Node server, model, index, and images continue running on the Mac. Vercel is not running the search engine. This setup requires no paid Render service.

Set `PUBLIC_ORIGIN` on the running Mac server to the exact tunnel URL and `ADDITIONAL_PUBLIC_ORIGINS=https://museumdatabase-clip.vercel.app`. Restart the server after changing these process environment variables. A replacement tunnel URL must also be updated in `vercel.json` and deployed. Only the production frontend origin is allowed; Vercel preview origins are not automatically trusted. The Mac must stay awake and both processes must stay running. When offline, the interface remains available, but search does not.
