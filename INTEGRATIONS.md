# Integration setup

The Node server serves the web app and proxies signed Last.fm write requests. Last.fm shared secrets belong only in the server environment; never put them in the browser or commit them.

## Run locally

1. Copy `.env.example` to `.env` and set `LASTFM_SHARED_SECRET`.
2. Run `npm start` and open `http://localhost:8787`.
3. In Settings > Last.fm, enter the API key from [Last.fm API account settings](https://www.last.fm/api/account/create), then choose **Save & validate** and **Connect Last.fm**. Approve access in the new tab and return to MusicHeaven to verify.
4. In Settings > Integrations, enter a Google OAuth Client ID; in Google Cloud, enable YouTube Data API v3 and allow `http://localhost:8787` as an authorized JavaScript origin. Connect the account, then turn on YouTube Music sync in Settings > Library.
5. Choose **Sync now** to add imported local tracks to the private **MusicHeaven Library** YouTube playlist. Search requests use YouTube quota, so each sync processes at most 20 tracks. The official YouTube API does not provide listening-history sync.

## Deploy

Deploy this Node project as a Node 18+ web service. Set `LASTFM_SHARED_SECRET` in the host's secret/environment settings and set `APP_ORIGINS` to the exact app origins when the web app or Capacitor build is hosted separately. The app can use the same-origin server automatically; for a separate app host or Capacitor build, enter the backend's HTTPS origin in Settings > Last.fm > Backend API URL. Configure HTTPS for public deployments.

The Last.fm API key and Google OAuth Client ID are public identifiers and are stored in the user's browser settings. Last.fm user session keys are stored locally for scrobbling and are deliberately excluded from backup exports. Google access tokens are held only in memory and require reconnecting after a page reload.
