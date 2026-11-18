const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { createServer, signLastFmParams } = require("./server");

function startServer(options = {}) {
  const server = createServer({
    env: { LASTFM_SHARED_SECRET: "server-only-secret", ...options.env },
    fetchImpl: options.fetchImpl || (async () => Response.json({ ok: true })),
    staticRoot: options.staticRoot
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("Last.fm signatures sort fields and omit format and existing signatures", () => {
  const params = { format: "json", method: "auth.getToken", api_key: "public-key", api_sig: "ignored" };
  const expected = crypto.createHash("md5")
    .update("api_keypublic-keymethodauth.getTokensecret")
    .digest("hex");
  assert.equal(signLastFmParams(params, "secret"), expected);
});

test("config reports secret availability without returning the secret", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/config`);
  assert.deepEqual(await response.json(), { lastFmSecretConfigured: true });
});

test("authorization token is signed on the server and returns a Last.fm approval URL", async (t) => {
  let receivedBody;
  const { server, baseUrl } = await startServer({
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://ws.audioscrobbler.com/2.0/");
      receivedBody = new URLSearchParams(options.body);
      return Response.json({ token: "temporary-token" });
    }
  });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/lastfm/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "public-key" })
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(receivedBody.get("api_sig"), signLastFmParams({
    api_key: "public-key",
    method: "auth.getToken",
    format: "json"
  }, "server-only-secret"));
  const authorizationUrl = new URL(result.authorizationUrl);
  assert.equal(authorizationUrl.origin, "https://www.last.fm");
  assert.equal(authorizationUrl.searchParams.get("token"), "temporary-token");
  assert.equal(result.token, "temporary-token");
});

test("authorized Last.fm tokens exchange for sessions without returning the shared secret", async (t) => {
  let receivedBody;
  const { server, baseUrl } = await startServer({
    fetchImpl: async (url, options) => {
      receivedBody = new URLSearchParams(options.body);
      return Response.json({ session: { key: "user-session-key", name: "listener" } });
    }
  });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/lastfm/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "public-key", token: "approved-token" })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sessionKey: "user-session-key", username: "listener" });
  assert.equal(receivedBody.get("api_sig"), signLastFmParams({
    api_key: "public-key",
    method: "auth.getSession",
    token: "approved-token",
    format: "json"
  }, "server-only-secret"));
});

test("scrobbles are signed by the backend before being sent to Last.fm", async (t) => {
  let receivedBody;
  const { server, baseUrl } = await startServer({
    fetchImpl: async (url, options) => {
      receivedBody = new URLSearchParams(options.body);
      return Response.json({ scrobbles: { "@attr": { accepted: "1", ignored: "0" } } });
    }
  });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/lastfm/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "public-key",
      sessionKey: "user-session",
      event: "scrobble",
      track: { artist: "Artist", title: "Track", album: "Album", duration: 180, timestamp: 1700000000 }
    })
  });
  assert.equal(response.status, 200);
  assert.equal(receivedBody.get("method"), "track.scrobble");
  assert.equal(receivedBody.get("sk"), "user-session");
  assert.equal(receivedBody.get("api_sig"), signLastFmParams({
    method: "track.scrobble",
    api_key: "public-key",
    artist: "Artist",
    track: "Track",
    album: "Album",
    duration: "180",
    timestamp: "1700000000",
    sk: "user-session",
    format: "json"
  }, "server-only-secret"));
});

test("track API accepts only supported event names", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/lastfm/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "public-key",
      sessionKey: "user-session",
      event: "unsupported",
      track: { artist: "Artist", title: "Track" }
    })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unsupported Last\.fm track event/);
});

test("Last.fm protected routes fail explicitly when the shared secret is missing", async (t) => {
  const { server, baseUrl } = await startServer({ env: { LASTFM_SHARED_SECRET: "" } });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/lastfm/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "public-key" })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /shared secret is not configured/);
});

test("browser API requests reject origins not explicitly allowed", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/config`, {
    headers: { Origin: "https://untrusted.example" }
  });
  assert.equal(response.status, 403);
});
