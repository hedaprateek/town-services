#!/usr/bin/env node
/**
 * Builds services.json from services.xlsx.
 *
 *   node scripts/make-services.js
 *
 * The workbook is the source of truth; the JSON is what the page fetches.
 * Edit the spreadsheet, run this, commit both.
 *
 * Three sheets:
 *   About     Field / Value pairs — the title, the caution, the theme
 *   Services  one row per contact
 *   Sponsors  one row per paid slot, and optional
 *
 * Sponsors are built into their own list, never into `rows`. That separation
 * is what stops a paid slot being counted, searched or shared as though a
 * neighbour had put it there:
 *
 *   Name      the business
 *   Tagline   one line about them
 *   Offer     optional, a few words shown as a pill
 *   Phone     optional, gives the slot a call button
 *   Link      optional, http(s) only
 *   Slot      top | feed | footer   (default feed)
 *   Until     optional YYYY-MM-DD; a slot past its date is not published
 *
 * A sheet whose name starts with an underscore is ignored, so drafts and
 * working notes can live in the same file without reaching the page.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const LIB = path.join(CACHE, "xlsx.js");
if (!fs.existsSync(LIB)) {
  fs.mkdirSync(CACHE, { recursive: true });
  console.log("fetching SheetJS (once)…");
  execFileSync("curl", ["-sSL", "-o", LIB,
    "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"], { stdio: "inherit" });
}
const X = require(LIB);

/** Sheets that hold contacts. Everything else is settings or a draft. */
const SERVICES = /^(services|services & help|help|vendors|trades|town)/i;
/** The sheet that holds paid slots. Kept apart from the contacts on purpose. */
const SPONSORS = /^(sponsors|sponsor|ads|adverts|advertisers)$/i;
const AD_SLOTS = ["top", "feed", "footer"];

function build(bytes) {
  const wb = X.read(bytes, { type: "buffer" });

  const about = {};
  const aboutName = wb.SheetNames.filter(n => /^about$/i.test(n.trim()))[0];
  if (aboutName) {
    X.utils.sheet_to_json(wb.Sheets[aboutName], { defval: "", raw: false }).forEach(r => {
      const k = Object.keys(r);
      about[String(r[k[0]]).trim().toLowerCase()] = String(r[k[1]]).trim();
    });
  }

  /* ── Kept in the sheet, off the page ──
     An underscore in front of a sheet tab, a column heading or a single cell
     means "ours, not the noticeboard's": the spare number the committee keeps,
     the resident who asked not to be listed. A Hide column with a yes in it
     takes the whole row out.

     Applied where the rows are gathered, not where they are drawn, so the
     cards, the search, the share text, the detail sheet and the published file
     are all covered by the one rule and none of them can show what the others
     hide. */
  var HIDE_COL = /^(hide|hidden|skip|unlisted|donotpublish|dontpublish)$/;
  var HIDE_YES = /^(y|yes|true|1|x|✓|✔|हाँ|हा|होय)$/i;
  function normKey(k) { return String(k).toLowerCase().replace(/[^a-z]/g, ""); }
  function isHidden(v) { return String(v == null ? "" : v).trim().charAt(0) === "_"; }
  function rowHidden(r) {
    for (var k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
      if (HIDE_COL.test(normKey(k)) && HIDE_YES.test(String(r[k] == null ? "" : r[k]).trim()))
        return true;
    }
    return false;
  }
  /** A copy with every hidden column and every hidden cell taken out. */
  function shown(r) {
    var out = {};
    for (var k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
      if (isHidden(k) || HIDE_COL.test(normKey(k))) continue;
      out[k] = isHidden(r[k]) ? "" : r[k];
    }
    return out;
  }
  /** Does this row still say anything once the hidden parts are gone? */
  function hasAnything(r) {
    for (var k in r) {
      if (Object.prototype.hasOwnProperty.call(r, k) &&
          String(r[k] == null ? "" : r[k]).trim() !== "") return true;
    }
    return false;
  }

  const names = wb.SheetNames.filter(n =>
    n.trim().charAt(0) !== "_" && SERVICES.test(n.trim()));
  if (!names.length)
    throw new Error("No services sheet. Expected one named Services, Help, Vendors, Trades or Town.");

  const rows = [];
  const seen = {};
  for (const n of names) {
    X.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: false })
      .filter(r => Object.keys(r).some(k => String(r[k] || "").trim()))
      .filter(r => !rowHidden(r))
      .map(shown)
      .filter(hasAnything)
      .forEach(r => {
        // The same trade listed twice should appear once.
        const id = [r.Name, r.Phone, r.Role].join("|").toLowerCase().trim();
        if (id !== "||" && seen[id]) return;
        seen[id] = 1;
        rows.push(r);
      });
  }

  const columns = [];
  rows.forEach(r => Object.keys(r).forEach(k => {
    if (columns.indexOf(k) < 0) columns.push(k);
  }));

  /* This file is read by the whole town. Anything still marked hidden by the
     time it gets here is a leak, not a display bug. */
  columns.forEach(c => {
    if (isHidden(c) || HIDE_COL.test(normKey(c)))
      throw new Error("hidden column would be published: " + c);
  });
  rows.forEach((r, i) => Object.keys(r).forEach(k => {
    if (isHidden(r[k]))
      throw new Error("hidden value would be published, row " + (i + 1) + ", " + k);
  }));

  /* ── Paid slots ──
     A separate sheet, and separate all the way through to the page: sponsors
     never join `rows`, so they are never counted in the header, returned by a
     search, grouped under a trade or shared as a number a neighbour gave. The
     columns are fixed and few, because an advertiser filling in whatever they
     like is how a paid slot ends up looking like a listing. */
  const sponsorName = wb.SheetNames.filter(n =>
    n.trim().charAt(0) !== "_" && SPONSORS.test(n.trim()))[0];
  const sponsorProblems = [];
  const stamp = new Date().toISOString().slice(0, 10);
  let lapsed = 0;
  const sponsors = [];
  if (sponsorName) {
    const field = (r, rx) => {
      for (const k in r) {
        if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
        if (rx.test(normKey(k))) {
          const v = String(r[k] == null ? "" : r[k]).trim();
          if (v) return isHidden(v) ? "" : v;
        }
      }
      return "";
    };
    X.utils.sheet_to_json(wb.Sheets[sponsorName], { defval: "", raw: false })
      .filter(r => Object.keys(r).some(k => String(r[k] || "").trim()))
      .filter(r => !rowHidden(r))
      .forEach((r, i) => {
        const where = sponsorName + " row " + (i + 2);
        const name = field(r, /^(name|business|shop|sponsor|advertiser)$/);
        if (!name) { sponsorProblems.push(where + ": no name"); return; }

        const slot = (field(r, /^(slot|placement|position|where)$/) || "feed").toLowerCase();
        if (AD_SLOTS.indexOf(slot) < 0) {
          sponsorProblems.push(where + ': slot "' + slot + '" is not one of ' + AD_SLOTS.join(", "));
          return;
        }
        const link = field(r, /^(link|url|website|web|site)$/);
        // Only a real web address. A javascript: or data: URL in a paid slot
        // would be somebody else's script running on the town's page.
        if (link && !/^https?:\/\//i.test(link)) {
          sponsorProblems.push(where + ": link must start with http:// or https:// — got " + link);
          return;
        }
        const until = field(r, /^(until|expires|expiry|till|ends|paidupto|paiduntil)$/);
        if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
          sponsorProblems.push(where + ": until must be YYYY-MM-DD — got " + until);
          return;
        }
        // A slot that has run out stops being published at all, rather than
        // relying on every phone to hide it.
        if (until && until < stamp) { lapsed++; return; }

        sponsors.push({
          name: name,
          line: field(r, /^(tagline|line|about|description|desc|says|blurb)$/),
          offer: field(r, /^(offer|deal|discount|highlight)$/),
          phone: field(r, /^(phone|mobile|cell|tel|contactno|number)$/),
          link: link,
          slot: slot,
          until: until
        });
      });
  }

  const out = {
    title: about["title"] || "Local Services & Help",
    tagline: about["tagline"] || "Plumbers, electricians, help at home — numbers collected by neighbours.",
    city: about["city"] || "",
    theme: (about["theme"] || "civic").toLowerCase(),
    country: about["country code"] || about["country"] || "91",
    // The caution travels with every number that leaves the page, so it lives
    // in the data rather than in the markup.
    note: about["note"] || "",
    noteHi: about["note hi"] || about["note hindi"] || "",
    noteMr: about["note mr"] || about["note marathi"] || "",
    // Where to send somebody who wants a slot. Empty means this list is not
    // selling space, and the page then shows no advertising apparatus at all.
    adsContact: about["ads contact"] || about["adscontact"] || about["advertise"] || "",
    updated: stamp,
    sheets: names,
    columns: columns,
    rows: rows,
    sponsors: sponsors
  };

  /* This file is public and it holds people's phone numbers, so the build
     stops rather than shipping something unexpected. */
  const problems = [];
  const allowed = {};
  names.forEach(n => X.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: false })
    .forEach(r => { allowed[JSON.stringify(r)] = 1; }));
  out.rows.forEach((r, i) => {
    if (!allowed[JSON.stringify(r)]) problems.push("row " + (i + 1) + " is not from a listed sheet");
  });
  if (!out.rows.length) problems.push("no rows — the page would be empty");
  out.rows.forEach((r, i) => {
    const name = Object.keys(r).filter(k => /^name$|^person$|^service$/i.test(k.trim()))[0];
    if (!name || !String(r[name] || "").trim())
      problems.push("row " + (i + 1) + " has no name");
  });
  sponsorProblems.forEach(p => problems.push(p));
  /* Not an error — a shop the neighbours already listed is entitled to buy a
     slot as well, and both entries are honest so long as the paid one carries
     its label. Worth saying out loud once, though, because it is also exactly
     what it looks like when advertising starts leaking into the list. */
  const warnings = [];
  const sponsorNames = {};
  sponsors.forEach(s => { sponsorNames[s.name.toLowerCase()] = 1; });
  out.rows.forEach(r => {
    const nm = Object.keys(r).filter(k => /^name$|^person$|^service$/i.test(k.trim()))[0];
    const v = nm ? String(r[nm] || "").trim() : "";
    if (v && sponsorNames[v.toLowerCase()])
      warnings.push('"' + v + '" is both a sponsor and a listing — the paid slot ' +
        "is labelled, the listing is not, so make sure the listing earned its place");
  });
  if (lapsed) warnings.push(lapsed + " sponsor slot(s) had run out and were left unpublished");
  const SHAPE = ["title", "tagline", "city", "theme", "country", "note", "noteHi", "noteMr",
                 "adsContact", "updated", "sheets", "columns", "rows", "sponsors"];
  Object.keys(out).filter(k => SHAPE.indexOf(k) < 0)
    .forEach(k => problems.push("unexpected field: " + k));

  return { out, problems, warnings, sheets: names };
}

if (require.main === module) {
  const src = path.join(ROOT, "services.xlsx");
  if (!fs.existsSync(src)) {
    console.error("services.xlsx not found next to this project.");
    process.exit(1);
  }
  const { out, problems, warnings, sheets } = build(fs.readFileSync(src));
  if (problems.length) {
    console.error("REFUSING TO WRITE:");
    problems.slice(0, 10).forEach(p => console.error("  " + p));
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, "services.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote services.json");
  console.log("  from:    " + sheets.join(", "));
  console.log("  rows:    " + out.rows.length);
  console.log("  columns: " + out.columns.join(", "));
  if (out.sponsors.length) {
    const by = {};
    out.sponsors.forEach(s2 => { by[s2.slot] = (by[s2.slot] || 0) + 1; });
    console.log("  sponsors: " + out.sponsors.length + " (" +
      Object.keys(by).map(k => by[k] + " " + k).join(", ") + ")");
  } else if (out.adsContact) {
    console.log("  sponsors: none — the slots will invite advertisers to " + out.adsContact);
  }
  warnings.forEach(w => console.log("  warn:    " + w));
  const noPhone = out.rows.filter(r => !String(r.Phone || "").trim()).length;
  if (noPhone) console.log("  note:    " + noPhone + " of " + out.rows.length +
                           " rows have no phone number — nothing to call or message");
}

module.exports = { build };
