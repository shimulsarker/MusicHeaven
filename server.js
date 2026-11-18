const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = __dirname;
const staticRoot = path.join(projectRoot, "src");
const lastFmEndpoint = "https://ws.audioscrobbler.com/2.0/";
const defaultOrigins = [
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost"
];
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".lrc": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "audio/webm"
};

function signLastFmParams(params, sharedSecret) {
  const signature = Object.keys(params)
    .filter((key) => key !== "format" && key !== "callback" && key !== "api_sig")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return crypto.createHash("md5").update(`${signature}${sharedSecret}`).digest("hex");
}

async function callLastFm(params, sharedSecret, fetchImpl) {
  const requestParams = { ...params, format: "json" };
  if (sharedSecret) requestParams.api_sig = signLastFmParams(requestParams, sharedSecret);
  const response = await fetchImpl(lastFmEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(requestParams)
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Last.fm returned an unreadable response.");
  }
  if (!response.ok || result.error) {
    const message = result.message || `Last.fm returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.ok ? 400 : 502;
    throw error;
  }
  return result;
}

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    const error = new Error("Request body must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }
}

function requiredString(value, name, maximumLength = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength) {
    const error = new Error(`${name} is required and must be at most ${maximumLength} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

function loadEnvironmentFile(filePath = path.join(projectRoot, ".env")) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) return;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  });
}

function sendStaticFile(request, response, pathname, root) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    jsonResponse(response, 400, { error: "Invalid URL path." });
    return;
  }
  const requestedPath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(root, requestedPath);
  if (!resolvedPath.startsWith(`${path.resolve(root)}${path.sep}`)) {
    jsonResponse(response, 403, { error: "Path is outside the static app directory." });
    return;
  }
  fs.stat(resolvedPath, (error, stats) => {
    if (error || !stats.isFile()) {
      jsonResponse(response, 404, { error: "File not found." });
      return;
    }
    response.writeHead(200, {
      "Cache-Control": path.extname(resolvedPath) === ".html" ? "no-cache" : "public, max-age=3600",
      "Content-Length": stats.size,
      "Content-Type": mimeTypes[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = fs.createReadStream(resolvedPath);
    stream.on("error", () => {
      if (!response.headersSent) jsonResponse(response, 500, { error: "Unable to read requested file." });
      else response.destroy();
    });
    stream.pipe(response);
  });
}

function createServer(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const root = options.staticRoot || staticRoot;
  const configuredOrigins = (env.APP_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins.length ? configuredOrigins : defaultOrigins);
  const recentRequests = new Map();

  return http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      jsonResponse(response, 403, { error: "This app origin is not allowed by the backend." });
      return;
    }
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      jsonResponse(response, 400, { error: "Invalid request URL." });
      return;
    }
    if (url.pathname.startsWith("/api/lastfm/")) {
      const now = Date.now();
      const clientIp = request.socket.remoteAddress || "unknown";
      const rate = recentRequests.get(clientIp);
      if (!rate || now - rate.startedAt >= 60_000) {
        recentRequests.set(clientIp, { startedAt: now, count: 1 });
      } else if (rate.count >= 120) {
        jsonResponse(response, 429, { error: "Too many Last.fm requests. Try again in a minute." });
        return;
      } else {
        rate.count += 1;
      }
    }

    if (url.pathname === "/health" && request.method === "GET") {
      jsonResponse(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/config" && request.method === "GET") {
      jsonResponse(response, 200, {
        lastFmSecretConfigured: Boolean(env.LASTFM_SHARED_SECRET)
      });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/lastfm/")) {
      try {
        const body = await readJsonBody(request);
        const apiKey = requiredString(body.apiKey, "Last.fm API key", 128);
        const sharedSecret = env.LASTFM_SHARED_SECRET;
        const authParams = { api_key: apiKey };
        if (url.pathname !== "/api/lastfm/validate" && !sharedSecret) {
          const error = new Error("Last.fm shared secret is not configured on the backend.");
          error.statusCode = 503;
          throw error;
        }

        if (url.pathname === "/api/lastfm/validate") {
          await callLastFm({
            method: "chart.getTopTracks",
            api_key: apiKey,
            limit: "1"
          }, "", fetchImpl);
          jsonResponse(response, 200, { valid: true });
          return;
        }

        if (url.pathname === "/api/lastfm/auth-token") {
          const result = await callLastFm({
            method: "auth.getToken",
            ...authParams
          }, sharedSecret, fetchImpl);
          const token = requiredString(result.token, "Last.fm authorization token", 256);
          const authorizationParams = new URLSearchParams({
            api_key: apiKey,
            token,
            api_sig: signLastFmParams({ api_key: apiKey, token }, sharedSecret)
          });
          jsonResponse(response, 200, {
            token,
            authorizationUrl: `https://www.last.fm/api/auth/?${authorizationParams}`
          });
          return;
        }

        if (url.pathname === "/api/lastfm/session") {
          const token = requiredString(body.token, "Last.fm authorization token", 256);
          const result = await callLastFm({
            method: "auth.getSession",
            ...authParams,
            token
          }, sharedSecret, fetchImpl);
          const session = result.session;
          if (!session || typeof session.key !== "string" || typeof session.name !== "string") {
            throw new Error("Last.fm did not return a valid user session.");
          }
          jsonResponse(response, 200, { sessionKey: session.key, username: session.name });
          return;
        }

        if (url.pathname === "/api/lastfm/track") {
          const sessionKey = requiredString(body.sessionKey, "Last.fm session key", 512);
          const track = body.track;
          if (!track || typeof track !== "object" || Array.isArray(track)) {
            const error = new Error("Track details are required.");
            error.statusCode = 400;
            throw error;
          }
          const artist = requiredString(track.artist, "Track artist", 200);
          const title = requiredString(track.title, "Track title", 200);
          const album = typeof track.album === "string" ? track.album.slice(0, 200) : "";
          const duration = Number(track.duration);
          let params;
          if (body.event === "now-playing") {
            params = {
              method: "track.updateNowPlaying",
              api_key: apiKey,
              artist,
              track: title,
              album,
              duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : undefined,
              sk: sessionKey
            };
          } else if (body.event === "scrobble") {
            const timestamp = Number(track.timestamp);
            if (!Number.isInteger(timestamp) || timestamp <= 0) {
              const error = new Error("A valid scrobble timestamp is required.");
              error.statusCode = 400;
              throw error;
            }
            params = {
              method: "track.scrobble",
              api_key: apiKey,
              artist,
              track: title,
              album,
              duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : undefined,
              timestamp,
              sk: sessionKey
            };
          } else {
            const error = new Error("Unsupported Last.fm track event.");
            error.statusCode = 400;
            throw error;
          }
          Object.keys(params).forEach((key) => {
            if (params[key] === undefined || params[key] === "") delete params[key];
          });
          const result = await callLastFm(params, sharedSecret, fetchImpl);
          jsonResponse(response, 200, { ok: true, result });
          return;
        }

        jsonResponse(response, 404, { error: "Last.fm API route not found." });
      } catch (error) {
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 502;
        jsonResponse(response, statusCode, { error: error.message || "Last.fm request failed." });
      }
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      sendStaticFile(request, response, url.pathname, root);
      return;
    }
    jsonResponse(response, 404, { error: "Route not found." });
  });
}

if (require.main === module) {
  loadEnvironmentFile();
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || "0.0.0.0";
  createServer().listen(port, host, () => {
    console.log(`MusicHeaven server listening on http://${host}:${port}`);
  });
}

module.exports = { callLastFm, createServer, loadEnvironmentFile, signLastFmParams };
