#!/usr/bin/env node
/**
 * Builds services.json from services.xlsx.
 *
 *   node scripts/make-services.js
 *
 * The workbook is the source of truth; the JSON is what the page fetches.
 * Edit the spreadsheet, run this, commit both.
 *
 * Two sheets:
 *   About     Field / Value pairs — the title, the caution, the theme
 *   Services  one row per contact
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

  const names = wb.SheetNames.filter(n =>
    n.trim().charAt(0) !== "_" && SERVICES.test(n.trim()));
  if (!names.length)
    throw new Error("No services sheet. Expected one named Services, Help, Vendors, Trades or Town.");

  const rows = [];
  const seen = {};
  for (const n of names) {
    X.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: false })
      .filter(r => Object.keys(r).some(k => String(r[k] || "").trim()))
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
    updated: new Date().toISOString().slice(0, 10),
    sheets: names,
    columns: columns,
    rows: rows
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
  const SHAPE = ["title", "tagline", "city", "theme", "country", "note", "noteHi", "noteMr",
                 "updated", "sheets", "columns", "rows"];
  Object.keys(out).filter(k => SHAPE.indexOf(k) < 0)
    .forEach(k => problems.push("unexpected field: " + k));

  return { out, problems, sheets: names };
}

if (require.main === module) {
  const src = path.join(ROOT, "services.xlsx");
  if (!fs.existsSync(src)) {
    console.error("services.xlsx not found next to this project.");
    process.exit(1);
  }
  const { out, problems, sheets } = build(fs.readFileSync(src));
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
  const noPhone = out.rows.filter(r => !String(r.Phone || "").trim()).length;
  if (noPhone) console.log("  note:    " + noPhone + " of " + out.rows.length +
                           " rows have no phone number — nothing to call or message");
}

module.exports = { build };
