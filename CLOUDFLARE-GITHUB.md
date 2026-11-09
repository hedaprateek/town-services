# Deploy both directories from GitHub

This release uses Google sign-in and Firebase Firestore for both directories,
approvals, workbooks, documents and audit history. Excel/CSV is an admin import
and export format. No Cloudflare database, email sender or service-account key is
required. The owner is **prateekbct@gmail.com**.

## One deployment already includes both interfaces

The `town-services` **google-access** branch is pushed to GitHub and contains
both `/town/` and `/society/`, both contact editors, and the common `/admin/` page.
Deploying the `community-directory` Worker from that branch is sufficient to use
**both directories**. You do not need to deploy a second Worker to start using the
society directory. Use the town column in the table below for that single deployment.

The separate `People-Information` release is also complete, committed and tested
locally. Its Git push from this machine is currently returning HTTP 403 despite
confirmed repository write access. Until that push succeeds, its `google-access`
branch is not available on GitHub. A code-only Git bundle is prepared locally at
`town-services/private-data/society-google-access.bundle`; it contains the society
release commits relative to its existing `main`, without copying runtime contacts
or migration data. On the other device, transfer that bundle securely and run:

```text
git clone https://github.com/hedaprateek/People-Information.git
cd People-Information
git fetch /path/to/society-google-access.bundle google-access:google-access
git switch google-access
git push -u origin google-access
```

Only then use the society column below if you want to keep its separate existing
`society-info` hostname. The single shared Worker above is ready on GitHub now.

## Cloudflare dashboard settings

Use **Workers with Git integration**, in the existing Cloudflare account. Select
the **google-access** production branch explicitly in each repository. The old
`main` branches still contain the previous static/access-code versions.

| Setting | Town services | Society directory |
| --- | --- | --- |
| GitHub repository | `hedaprateek/town-services` | `hedaprateek/People-Information` |
| Production branch | `google-access` | `google-access` |
| Worker name (must match Wrangler) | `community-directory` | `society-info` |
| Root directory | `/` (repository root) | `/` (repository root) |
| Build command | `npm test` | `npm test` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |
| Node version | `24` | `24` |
| Website | `https://community-directory.hedaprateek.workers.dev/` | `https://society-info.hedaprateek.workers.dev/` |

In **Workers & Pages → Create application → Import a repository** (or the existing
Worker's **Settings → Builds**), connect the repository and set the values above.
Cloudflare installs the dependencies from `package-lock.json`. `.node-version`
pins Node 24; set the build variable `NODE_VERSION=24` if the dashboard overrides
it. Do not set `CI=false` or disable the checks to make a failing build publish.

Wrangler also runs `npm run build` through its tracked `build.command`, so a
direct `npx wrangler deploy` cannot accidentally publish stale/unbuilt assets.
The Worker must run before static assets; `run_worker_first: true` is already set.
Do not select a static-only upload or a Cloudflare Pages deployment for this
release. Do not publish the repository root as static assets.

The public Firebase web configuration, owner, account ID and default directory
are already in each `wrangler.jsonc`. No runtime secrets, D1, KV or R2 bindings
need to be added. Cloudflare's Git integration manages deployment credentials;
you do not need Wrangler login or a local upload from the other device.

Both Workers contain the same reviewed application, with a different starting
directory. Both include `/town/`, `/society/`, `/admin/`, `/town/admin.html` and
`/society/admin.html`. `/admin.html` forwards to that site's contact editor.
They use the **same Firestore database**, so import the initial directory data
only once. Browsers sign in on each hostname separately; membership and approval
are shared. They do not depend on either repository being checked out beside the
other, and Cloudflare does not fetch code or private data from the other repository.

Official Cloudflare instructions:
[Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/),
[build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Firebase hostname authorization

Firebase project **community-directory-88fc7** is already on Spark with Google
sign-in, the Standard Firestore database in Mumbai, security rules, the members
status/email index, and four large-content indexing exemptions configured. Both
hostnames below are authorized in Firebase; this was checked through the public
Google project settings API after saving the society hostname in the console.
Do not switch to paid billing for this release.

Before the first login, open Firebase Authentication → Settings → Authorized
domains and verify **both** exact hostnames:

```text
community-directory.hedaprateek.workers.dev
society-info.hedaprateek.workers.dev
```

If you change a Worker name or use a custom domain, authorize that actual hostname
too. A production hostname is required for the final test; preview hostnames
are not automatically authorized for Google sign-in.

## First login and import

1. Open the deployed website in Chrome/Safari and use **Continue with Google**.
   Choose **prateekbct@gmail.com** to initialize the owner account. This app uses
   Google identity; there is no separate directory password or email-code sender.
2. Open `/admin/`. Under **Initial directory import**, upload the prepared local
   `private-data/initial-import.json`. It contains contact details and is deliberately
   ignored by Git. Transfer it securely to your deployment device; do not commit it
   or put it in Cloudflare's static asset directory. The initial file is not needed
   to build or deploy the code. Without it, Google login and the admin page work,
   and the contact editors can import their respective workbooks instead.
3. If an import is interrupted, upload the **same file** again. Identical saved
   directories are preserved, missing directories import, and document uploads
   resume. Different existing directory data is never overwritten by this importer.
4. Under **Approve people in advance**, paste approved Google email addresses or
   import an Excel/CSV with an `Email` column (optional `Name`). Select society,
   town, or both. Existing members, including blocks, are preserved.
5. Other Google accounts complete **Request access** and wait for admin approval.
   Review requests in `/admin/`; only the owner can appoint another administrator.
6. Use the society/town contact editors to change records, upload Excel/CSV, review
   the draft, and **Publish**. This writes to Firestore immediately, with revision
   checks and audit history. Contact or permission changes need **no Git commit or
   Cloudflare redeployment**. Code/UI changes do need a Git push and a new build.

## Verify before switching existing links

Optional read-only command from either checkout after `npm ci`:

```text
npm run check:deployment -- https://community-directory.hedaprateek.workers.dev
npm run check:deployment -- https://society-info.hedaprateek.workers.dev
```

It checks configuration, Google hostname authorization, anonymous access denial,
no-cache headers and that source/data files are not public. It cannot substitute
for a real Google login or prove the authenticated Firestore connection works.

The final real-account check is:

- Owner can sign in, see the admin page, import, edit, publish and download a document.
- A new Google account sees the request form and cannot retrieve contacts before approval.
- Approval grants only the selected directory; the other directory stays protected.
- Blocking that same account denies its next request, including document URLs.
- An approved viewer cannot open either contact editor or the account-admin page.
- Sign-out returns to login; a signed-out visitor cannot open protected links.

Only after those checks, retire/redirect the old public sites and restrict the
public source repositories, contact JSON/workbooks and document copies. The old
GitHub Pages deployments and raw GitHub files are separate from these Workers.
Deploying this release does **not** make old public copies private. Previously
downloaded/offline copies cannot be recalled. Do not call the cutover complete
until those old publication paths are handled too.

## Source maintenance

`town-services` is the shared implementation source. `People-Information` carries
an independently buildable, reviewed snapshot in `.community/`, with hashes in
`.community/RELEASE.json`. Its root package/config builds that snapshot, not the
legacy root HTML, workbook or access-code middleware. To release future shared
changes, from `town-services` run `npm run release:society -- ../society-directory`,
validate both checkouts and push both `google-access` branches. Never copy runtime
data into that snapshot.

Automated checks use synthetic identities/data: JWT validation, Firestore Rules
emulator, approval/revocation and scope checks, both browser editors, error recovery,
resumable migration and the actual Wrangler packaging. Real Google OAuth and live
authenticated DB checks remain required after publishing. The most recent live
deployment attempt was blocked by Zscaler on the local machine; no successful
production login/import is claimed by this document.
