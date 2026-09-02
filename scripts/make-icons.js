#!/usr/bin/env node
/**
 * Writes icons/icon-192.png, icon-512.png and apple-touch-icon.png — the
 * home-screen icons for the installed app.
 *
 *   node scripts/make-icons.js
 *
 * Written by hand rather than pulled from a library: the project has no npm
 * dependencies and npm is not reachable here. A PNG is a signature, three
 * chunks and a CRC, and zlib ships with Node.
 *
 * The mark is the spanner from the page's own favicon, drawn full-bleed so
 * Android can mask it to whatever shape it likes.
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

/** pixels: (x, y) -> [r, g, b, a], each 0-255 */
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;                        // filter: none
    for (let x = 0; x < size; x++) {
      const c = pixel(x, y, size);
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------- the mark ---------- */
const BG = [0x0f, 0x76, 0x6e];     // the page's own teal
const FG = [0xfb, 0xf7, 0xf0];     // its paper

/** Distance from a point to a line segment — the honest way to draw a bar. */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  let t = (wx * vx + wy * vy) / (vx * vx + vy * vy);
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/* A spanner: an open ring at the top right with a shaft running down to the
   opposite corner. The shaft ends inside the ring so the two read as one
   object. Android crops about 10% off each edge when it masks an icon, so the
   whole mark stays inside the middle 62%.

   A first attempt drew the shaft from a start point along a direction and got
   both wrong — it ran off the corner and never met the head. Point-to-segment
   distance takes the two endpoints instead, which is what was actually meant. */
function draw(x, y, size) {
  const u = (x + 0.5) / size, v = (y + 0.5) / size;

  const onShaft = segDist(u, v, 0.34, 0.665, 0.605, 0.395) < 0.057;

  const hx = 0.665, hy = 0.335;
  const rr = Math.sqrt((u - hx) * (u - hx) + (v - hy) * (v - hy));
  const ring = rr < 0.158 && rr > 0.076;
  // The jaws open away from the shaft, up and to the right.
  const bite = (u - hx) - (v - hy) > 0.055;
  const onHead = ring && !bite;

  return (onShaft || onHead)
    ? [FG[0], FG[1], FG[2], 255]
    : [BG[0], BG[1], BG[2], 255];
}

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]
]) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, png(size, draw));
  console.log("wrote " + name + "  " + size + "x" + size +
              "  " + fs.statSync(file).size + " bytes");
}
