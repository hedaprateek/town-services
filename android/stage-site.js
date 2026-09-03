#!/usr/bin/env node
/**
 * Copies the site into the town flavour's assets, so the APK holds a working
 * copy of the page.
 *
 *   node android/stage-site.js
 *
 * An allowlist, not a copy of the folder. An APK is a zip that anyone it is
 * passed to can open, so what goes in is named one file at a time:
 *
 *   - admin.html is the publishing panel. It has no business in something
 *     handed around a town, token or no token.
 *   - services.xlsx is the working spreadsheet. services.json is the published
 *     list and the only data the page reads.
 *   - sw.js is left out on purpose. A service worker inside a WebView does not
 *     go through the asset loader unless it is wired up separately, so it
 *     would intercept the page's fetches and fail them. The app is already
 *     offline — the files are local — so there is nothing for it to do.
 *     index.html catches the failed registration.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "app", "src", "town", "assets");

const FILES = [
  "index.html",
  "services.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

// Anything matching these must never end up inside the APK.
const FORBIDDEN = /(^|\/)(admin\.html|.*\.xlsx|sw\.js|access-codes.*|member-codes.*|code-slips.*|\.git.*)$/i;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0, bytes = 0;
for (const rel of FILES) {
  if (FORBIDDEN.test(rel)) {
    console.error("refusing to stage " + rel);
    process.exit(1);
  }
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) {
    console.error("missing: " + rel);
    process.exit(1);
  }
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  n++;
  bytes += fs.statSync(to).size;
}

// Say it out loud rather than trusting the list above stayed right.
const staged = [];
(function walk(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + "/" + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel);
    else staged.push(rel);
  }
})(OUT, "");

const bad = staged.filter(f => FORBIDDEN.test(f));
if (bad.length) {
  console.error("these must not ship: " + bad.join(", "));
  process.exit(1);
}

console.log("staged " + n + " files, " + Math.round(bytes / 1024) + " KB:");
staged.forEach(f => console.log("  " + f));
