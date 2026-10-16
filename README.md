# Local Services & Help

A single-page list of local trades — plumbers, electricians, help at home — with a
call and a WhatsApp button against each. Anyone can open it; there is no sign-in.

**Live:** https://hedaprateek.github.io/town-services/

To preview local changes on Windows, double-click `start.cmd` (requires Node.js).
It opens **http://localhost:8799/**. Keep the launcher window open while testing.
Double-click `edit.cmd` to open the contact editor instead. The local preview serves
the website and editor; it does not expose the working spreadsheet or Git files.

---

## Filling in the list

Two ways, and they stay in step with each other.

### Simple upload process

Open [Manage town contacts](https://hedaprateek.github.io/town-services/admin.html).

1. For one contact, choose **Add a contact**, fill the form and **Add to draft**.
   For corrections, search the contact and choose **Edit**.
2. For several contacts, **Download blank template**, fill its Services sheet, save it,
   then **Upload an Excel or CSV**. Review the file and choose **Add / update contacts**.
   Matches use name, trade and category; filled fields update matches, blanks preserve
   existing values. Replace entire list is a separate option with confirmation.
3. Choose **Review changes**, then **Publish**. Publishing needs an owner GitHub token
   with Contents read/write for this repository, kept only for this browser tab.

Uploads remain drafts until published. Cancel upload leaves contacts and page settings
unchanged. Page settings/sponsors from an uploaded workbook are optional, unchecked by
default. Phone numbers should be text in Excel, especially numbers starting with `+` or `0`.
The JSON directory and Excel copy publish together in one commit. Newer remote changes
block publishing so they cannot be overwritten by an older draft. Download the draft
as Excel before reloading if this happens. The editor is not included in offline caches.

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

An optional `feedbackEmail` value in `services.json` sets the correction/suggestion
recipient. It defaults to the maintainer's public email, `prateekheda@yahoo.com`.

**`Services`** — one row per contact. Only `Name` is required.

| Column | Does |
|---|---|
| `Name` | Required |
| `Category` | The section heading — Repairs & Maintenance, Home Help, Utilities |
| `Role` | The trade, which becomes a sub-heading inside the category |
| `Phone` | Call and WhatsApp buttons. A number that cannot be completed gets no WhatsApp |
| `Covers` | Work or areas served, shown in contact details and included in search |
| `Charges`, `Timings`, `Notes` | Shown when the row is tapped |
| `Jobs` | Describe actual jobs handled, such as fitting sliding windows or repairing wallpaper |
| `Search Words` | Local names, spelling variations and other search phrases; hidden from contact details |

`Covers` also matches `Area`, `Areas`, `Serves`, `Speciality`, `Works`, `Summary` or `Info`.
The upload editor also accepts `Job Description` / `Work Description` for `Jobs`, and
`Keywords` / `Other Names` for `Search Words`. Both fields are included in the form,
blank template, spreadsheet export and published directory. Custom trade titles and
categories are allowed; the form suggests examples without restricting entries.

A sheet whose name starts with `_` is ignored, so drafts can live in the same file.

## The page

- Search is directly below the compact heading, followed by familiar service shortcuts.
- The search prompt is "What help do you need?". Five familiar trades stay in the main
  filter strip; other supplied service titles are under More services. Selecting one
  closes that panel and shows its name, so the selected filter stays clear.
- Compact contact rows show the name, translated trade and icon-only Call and WhatsApp
  buttons. Tap the name or Show more for areas, hours, charges, notes and phone details.
  Missing numbers are explained in the details; action icons retain accessible labels.
- Choose one service at a time. A new search clears the service selection and searches
  the whole directory. Reset filters returns to all contacts. Category browsing is
  available below the list, without a duplicate filter strip above it.
- Search matches names, areas and supplied details, plus common service phrases and
  aliases: `leaking tap`, `plumbing`, `nal`, `नल` and `नळ` all find plumbers. Multiple
  words can narrow a result, such as `leaking tap Rahul`.
- Everyday job searches use supplied work descriptions and search words. For example,
  `my sliding window is stuck` matches a contact whose details say they repair sliding
  windows, and spelling variants such as aluminium/aluminum are understood. Installer-only
  descriptions do not imply repair work. This is local word/phrase matching, with no
  external AI service or search tracking; useful results depend on accurate descriptions.
- Jobs appear in Show more, shared contact text and contact downloads. Search words
  help matching without cluttering contact cards or details. Empty results offer More
  services and a Suggest this service email draft carrying the original search.
- English, Hindi and Marathi are remembered per device. Known category and trade names
  are translated too; personal names and free-form supplied notes are preserved.
- Empty results provide a reset button and familiar service suggestions. Details support
  keyboard focus, Escape to close, and return focus to the button that opened them.
- Sharing a contact copies the details **with the caution attached**, so the warning
  travels with the number rather than staying behind on the page.
- In Show more, save a contact to favourites; the Saved shortcut shows only favourites
  and search can narrow them. Favourites remain on that browser/device, work offline,
  and survive phone/notes corrections. Clearing browser storage clears them.
- Download contact creates a standard `.vcf` file for the phone's Contacts app. It
  includes supplied details, the directory link and caution; no missing numbers are
  invented. Copy number and Share fall back to selectable text if clipboard access fails.
- Shared contact links open that contact's details directly. Unknown or removed
  contacts produce a message while keeping the directory usable.
- Report incorrect details and Suggest a service open editable email drafts. Nothing
  is sent or added to the directory automatically; submissions need maintainer review.

Public contacts added on 15 October 2026 include municipal/police office enquiries,
local aluminium and vehicle-body businesses, gas services, a hospital enquiry line,
and regional/national helplines available to Ichalkaranji residents. Each has a Source,
Source type and Source checked date in Show more. Source checked means the published
web listing was reviewed; numbers were not called and this does not endorse a provider.
Regional/national helplines are labelled in Covers. Published descriptions are kept
short, with no assumed prices or response times. The existing MSEDCL listing now has
its official customer-care number. JSON and Excel contain the same contacts.

On 16 October 2026, another 36 distinct business contacts were added: furniture and
interiors, RO servicing, computers and CCTV, appliances, solar, construction,
laundry, transport and travel, catering and venues, healthcare enquiries, and
industrial support. The directory now has 66 listings, 51 with telephone numbers.
Nearby providers and central brand booking numbers are identified in Covers or
Notes. Manufacturer dealer listings retain their publication-year caveat. Listings
whose contact sources could not be sufficiently confirmed were omitted.

An optional `WhatsApp` column set to `No` suppresses that action for contacts that only
publish a telephone channel. Existing listings retain their previous behaviour.

The website saves its page, search helper and complete directory for offline use after
an online visit. The footer shows whether the offline copy is ready or being used.
Network failures or malformed data use the last good directory. Only this directory's
own versioned caches are cleaned up; other websites' offline copies are preserved.
The admin page and working spreadsheet are excluded from the offline shell.

Run the search and compatibility checks with `node --test tests/directory.test.cjs`.
`directory-core.js` is included in the existing Android asset-staging allowlist, so a
future APK build can use the enhanced interface. Existing APKs keep their bundled UI
until an updated APK is released.

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
