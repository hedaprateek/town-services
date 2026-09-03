#!/usr/bin/env node
/**
 * Writes the launcher icons for both flavours, at every density Android asks
 * for.
 *
 *   node android/make-launcher-icons.js
 *
 * Same reason as scripts/make-icons.js for doing it by hand: this project has
 * no npm dependencies and npm is not reachable from here. A PNG is a
 * signature, three chunks and a CRC, and zlib ships with Node.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------- a minimal PNG encoder ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0;                       // no per-row filter
    for (let x = 0; x < size; x++) {
      const p = pixel(x, y, size);
      raw[at++] = p[0]; raw[at++] = p[1]; raw[at++] = p[2]; raw[at++] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/** Distance from a point to a line segment — the honest way to draw a bar. */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  let t = (wx * vx + wy * vy) / (vx * vx + vy * vy);
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/* ---------- the two marks ----------
   Both stay inside the middle 62% of the square: Android masks a launcher icon
   to whatever shape the phone's theme uses, and crops roughly a tenth off each
   edge doing it. */

/** The town list: the spanner from its own favicon. */
const TOWN_BG = [0x0f, 0x76, 0x6e];   // its teal
const TOWN_FG = [0xfb, 0xf7, 0xf0];   // its paper
function town(x, y, size) {
  const u = (x + 0.5) / size, v = (y + 0.5) / size;
  const onShaft = segDist(u, v, 0.34, 0.665, 0.605, 0.395) < 0.057;
  const hx = 0.665, hy = 0.335;
  const rr = Math.hypot(u - hx, v - hy);
  const ring = rr < 0.158 && rr > 0.076;
  const bite = (u - hx) - (v - hy) > 0.055;   // jaws open away from the shaft
  return onShaft || (ring && !bite)
    ? [TOWN_FG[0], TOWN_FG[1], TOWN_FG[2], 255]
    : [TOWN_BG[0], TOWN_BG[1], TOWN_BG[2], 255];
}

/** The society directory: a house, on the directory's navy. */
const SOC_BG = [0x0a, 0x16, 0x28];    // its navy
const SOC_FG = [0x22, 0xd3, 0xee];    // its bright teal
function society(x, y, size) {
  const u = (x + 0.5) / size, v = (y + 0.5) / size;
  const cx = 0.5;

  // The roof: everything under a pitch from the apex, in a band 0.075 thick.
  const apexY = 0.285, eaveY = 0.505, halfW = 0.235;
  const t = (v - apexY) / (eaveY - apexY);
  const edge = t * halfW;                       // how wide the roof is at this height
  const du = Math.abs(u - cx);
  const onRoof = v >= apexY && v <= eaveY && du <= edge && du >= edge - 0.105;

  // The walls: an open box below the eaves.
  const wallOut = 0.175, wallIn = 0.175 - 0.075;
  const bodyTop = eaveY - 0.02, bodyBot = 0.745;
  const inBody = v >= bodyTop && v <= bodyBot && du <= wallOut;
  const onWalls = inBody && (du >= wallIn || v >= bodyBot - 0.075);

  return onRoof || onWalls
    ? [SOC_FG[0], SOC_FG[1], SOC_FG[2], 255]
    : [SOC_BG[0], SOC_BG[1], SOC_BG[2], 255];
}

/* ---------- write them ---------- */
// Launcher icons are 48dp, so one file per density bucket.
const DENSITIES = [
  ["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]
];
const FLAVOURS = [["town", town], ["society", society]];

let wrote = 0;
for (const [flavour, draw] of FLAVOURS) {
  for (const [density, size] of DENSITIES) {
    const dir = path.join(__dirname, "app", "src", flavour, "res", "mipmap-" + density);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "ic_launcher.png");
    fs.writeFileSync(file, png(size, draw));
    wrote++;
  }
  console.log(flavour + ": 5 icons, 48px to 192px");
}
console.log("wrote " + wrote + " launcher icons");
