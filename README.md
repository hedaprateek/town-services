# Local Services & Help

A single-page list of local trades — plumbers, electricians, help at home — with a
call and a WhatsApp button against each. Anyone can open it; there is no sign-in.

**Live:** https://hedaprateek.github.io/town-services/

---

## Filling in the list

Two ways, and they stay in step with each other.

**The admin page** — open `admin.html`, edit the table, press Publish. It needs a GitHub
fine-grained token with **Contents: Read and write** on this repository; the token is kept
for that browser tab only and is never written into the page or the repo. Publishing writes
both `services.json` (what the page reads) and `services.xlsx` (so a later spreadsheet edit
starts from what is actually live).

**The spreadsheet** — *Download as Excel* from the admin page, edit it, upload it back; it
asks whether to add to the list or replace it. Or edit `services.xlsx` directly, run
`node scripts/make-services.js` and commit — same result, no token needed.

Either way, a row without a name is refused rather than half-published.

---

## How it works

There is no database and no backend. `services.xlsx` is the source of truth, a build
script turns it into `services.json`, and `index.html` fetches that JSON and renders it
in the browser.

```
services.xlsx  →  node scripts/make-services.js  →  services.json  →  index.html
```

To change the list:

1. Open `services.xlsx` and edit the **Services** sheet.
2. Run `node scripts/make-services.js`.
3. Commit both files and push. GitHub Pages redeploys within a minute.

The script refuses to write if a row has no name, if the list is empty, or if a row
appears that did not come from a listed sheet. The file it produces is public and holds
people's phone numbers, so it stops rather than shipping something unexpected.

## The spreadsheet

**`About`** — `Field` / `Value` pairs that set the page's identity.

| Field | Does |
|---|---|
| `Title` | The heading |
| `Tagline` | The line under it |
| `City` | Shown after the tagline |
| `Theme` | `civic` (warm, default), `slate` (dark) or `paper` (light) |
| `Country Code` | For the WhatsApp links — `91` unless you say otherwise |
| `Note` | The caution shown at the top, and carried into every shared message |
| `Note HI` | The same caution in Hindi |

**`Services`** — one row per contact. Only `Name` is required.

| Column | Does |
|---|---|
| `Name` | Required |
| `Category` | The section heading — Repairs & Maintenance, Home Help, Utilities |
| `Role` | The trade, which becomes a sub-heading inside the category |
| `Phone` | Call and WhatsApp buttons. A number that cannot be completed gets no WhatsApp |
| `Covers` | Two or three words under the name: *small works*, *routine jobs*, the areas they serve |
| `Charges`, `Timings`, `Notes` | Shown when the row is tapped |

`Covers` also matches `Area`, `Areas`, `Serves`, `Speciality`, `Works`, `Summary` or `Info`.

A sheet whose name starts with `_` is ignored, so drafts can live in the same file.

## The page

- One line per contact — name, trade, call, WhatsApp — with everything else a tap away.
- Grouped by category, then by trade inside it, so several plumbers sit together.
- Search across every field; the category chips only narrow browsing.
- English and Hindi, remembered per device.
- Sharing a contact copies the details **with the caution attached**, so the warning
  travels with the number rather than staying behind on the page.

## Deploying

**GitHub Pages** — Settings → Pages → Source: *Deploy from a branch*, branch `main`,
folder `/ (root)`. The `.nojekyll` file stops Jekyll rewriting anything.

**Cloudflare** — Workers & Pages → Create → Pages → Connect to Git → this repository.
Build command: none. Output directory: `/`. It serves the same static files, adds a
faster CDN and lets you put a custom domain in front.

Nothing here needs a build step, a package manager or a server. `node` is used only by
the spreadsheet-to-JSON script, and only on your own machine.

---

**Stunity Tech** · by Prateek
