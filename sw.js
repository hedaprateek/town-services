/**
 * Service worker: the list opens without a network.
 *
 * A tradesperson's number is wanted during a power cut, on a patchy connection,
 * or on a prepaid phone that has run out of data — which is exactly when a page
 * that needs the network is no use. Everything the page is built from is kept
 * on the device.
 *
 * Bump VERSION to retire every old cache on the next visit.
 */
var VERSION = "v1";
var SHELL = "shell-" + VERSION;   // the page and the fonts
var DATA = "data-" + VERSION;     // services.json, kept as the last good copy

/* Relative, so the same file works at /town-services/ on GitHub Pages and at
   / on Cloudflare or a custom domain. */
var SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

function isData(url) { return /\/services\.json$/i.test(url.pathname); }
function isFont(url) {
  return url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
}
/** Only a plain, complete 200 is worth keeping. */
function keepable(res) { return res && res.status === 200 && res.type !== "error"; }

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // One at a time: a font hiccup must not abort the install and leave the
      // page with no offline copy at all.
      return Promise.all(SHELL_FILES.map(function (u) {
        return c.add(new Request(u, { cache: "reload" }))["catch"](function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== DATA) return caches["delete"](k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  /* The list — always try the network so an edit shows up, and keep the last
     good copy behind it. The page appends ?v=<time> to defeat CDN caching, so
     the cache is keyed on the bare name or it would never once hit. */
  if (isData(url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (keepable(res)) {
          var copy = res.clone();
          caches.open(DATA).then(function (c) { c.put("services.json", copy); });
        }
        return res;
      })["catch"](function () {
        return caches.open(DATA).then(function (c) { return c.match("services.json"); })
          .then(function (hit) {
            if (!hit) return new Response("", { status: 504, statusText: "offline" });
            // Say when this copy was saved, so the page can date itself
            // honestly instead of stamping today over a week-old list.
            var h = new Headers(hit.headers);
            h.set("X-Offline-Copy", hit.headers.get("date") || "");
            return hit.blob().then(function (b) {
              return new Response(b, { status: 200, headers: h });
            });
          });
      })
    );
    return;
  }

  // The page itself — network first, so a publish is picked up.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        if (keepable(res)) {
          var copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put("./index.html", copy); });
        }
        return res;
      })["catch"](function () {
        return caches.match("./index.html", { ignoreSearch: true }).then(function (hit) {
          return hit || new Response(
            "<h1>Offline</h1><p>Open this page once with a connection and it will " +
            "work without one afterwards.</p>",
            { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
        });
      })
    );
    return;
  }

  // Fonts and icons — serve what is saved, refresh quietly behind it.
  if (url.origin !== self.location.origin && !isFont(url)) return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (keepable(res)) {
          var copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
        }
        return res;
      })["catch"](function () { return hit; });
      return hit || live;
    })
  );
});
