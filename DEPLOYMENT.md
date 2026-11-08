# Google sign-in and Firebase directory

This is the final design: **Firebase Authentication + Firestore for all live data**,
with a Cloudflare Worker serving the existing interfaces and protected API.
Excel/CSV is for bulk import/export through the editors. No Cloudflare database,
paid email sender, custom domain, GitHub publishing token or Firebase service-account
private key is needed.

Owner: `prateekbct@gmail.com`. It is configured in both `wrangler.jsonc` and
`firestore.rules`. Changing the owner requires updating and deploying both.

## Account setup

1. Open <https://console.firebase.google.com/> as the owner. Create a project,
   keep the **Spark/no-cost plan**, and leave Analytics disabled if it is not needed.
2. Add a **Web app**. Retain its web configuration: `projectId`, `apiKey`,
   `authDomain`, `appId`. These identify the application; they are not admin credentials.
3. Authentication → Sign-in method → enable **Google**, choose the support email,
   and save. Keep other sign-in providers disabled.
4. Firestore Database → Create database → **Standard edition**, `(default)`
   database, production mode, a suitable India region such as `asia-south1`.
   Do not enable open/test rules or attach a billing account.
5. Deploy the included rules and indexes:

   ```powershell
   .\node_modules\.bin\firebase.cmd login
   .\node_modules\.bin\firebase.cmd deploy --only firestore --project YOUR_PROJECT_ID
   ```

   Google must authorize the account before project creation or deployment.
   On this machine the Firebase CLI's `auth.firebase.tools` sign-in endpoint was
   blocked by the organization's web filter. The project has **not** been created.
   Use an approved connection that permits Firebase, or create/configure the project
   in Firebase Console. Rules can be pasted into the console; create the members
   `status ASC, email ASC` composite index and disable indexing of the large content
   fields as declared in `firestore.indexes.json`.

## Cloudflare setup

1. Keep **Workers Free**. Sign in with `npx wrangler login`.
2. Add these public application configuration values under `vars` in
   `wrangler.jsonc`, alongside `OWNER_EMAIL`:

   ```json
   "FIREBASE_PROJECT_ID": "your-project-id",
   "FIREBASE_API_KEY": "your-web-api-key",
   "FIREBASE_AUTH_DOMAIN": "your-project-id.firebaseapp.com",
   "FIREBASE_APP_ID": "your-web-app-id"
   ```

3. Run `npm run build`, `npm test`, and `npm run deploy`.
4. In Firebase Authentication → Settings → Authorized domains, add the exact
   deployed hostname, e.g. `community-directory.hedaprateek.workers.dev`.
5. Open the deployed `/signin.html` in Chrome/Safari, choose the owner account,
   then `/admin/`. Only that verified Google account bootstraps the owner role.
6. Until the project and rules are configured, sign-in shows a setup message and
   contact data remains inaccessible. `/health` reports configuration presence,
   not a successful live Google sign-in or database connection.

## Initial data and everyday work

Run `node scripts/prepare-initial-import.cjs ../society-directory` to prepare the
existing town/society contact data, source workbooks and document attachments in
`private-data/initial-import.json`. This file contains personal details. It is ignored
by Git and never staged as a website asset.

In `/admin/`, the owner uploads that file using **Initial directory import**.
It refuses to overwrite a directory that already exists. The two directories import
separately, so a network failure can leave one completed; use the relevant editor to
upload the remaining workbook. No resident emails are approved automatically.

Use **Add approved emails** or its spreadsheet upload to preapprove viewers for
society contacts, town services, or both. Existing people, especially blocks, are
preserved during imports. New Google accounts complete the request form and remain
pending until an administrator approves them. Only the owner appoints administrators.

Use `/town/admin.html` and `/society/admin.html` for contacts, Excel/CSV uploads,
reviewing drafts, publishing and exports. Publishing saves directly to Firestore;
no website deployment is needed for contact or permission changes. Concurrent stale
drafts are rejected. The source workbook is kept in an admin-only Firestore document;
underscore sheets/columns/cells remain excluded from viewer data.

Owner/admin actions are recorded in Firestore. Contact publishing saves its data,
workbook, prior data revision and audit event atomically. Manual JSON backups include
both current directories/workbooks, up to 5,000 member records, and the latest 1,000
audit events. Download material files separately. Securely retain these backups.

Current size limits: directory JSON **400 KB** each; source workbook approximately
**675 KB**; uploaded document **750 KB**. These fit Firestore's 1 MiB document limit
without requiring the paid-billing setup for Cloud Storage. Files over these sizes
are refused before publishing. This version suits text directories and small PDFs.

## Switching existing public links

Do this only after real owner/viewer sign-in, approval, revocation, workbook upload,
and document downloads work on the new deployment:

- Redirect/retire the old GitHub Pages websites and old society Worker routes.
- Remove or restrict access to publicly served contact JSON, workbooks, resident
  materials and source repositories. Protecting the new site cannot protect old
  public repository URLs or already downloaded files.
- The build never includes the live contacts, working workbooks, local migration
  file or material files as static assets. The Worker checks identity and approval;
  Firestore rules independently enforce the same permissions.
- Previous offline copies cannot be recalled. The new app does not cache contacts.
  Revocation stops future requests, including direct Firebase and document requests.

## Android

Google login cannot run inside the old embedded WebView. The updated Android
launcher opens the deployed directory in the system browser. Both flavors must use
the final protected URL, and neither bundles contacts. Update the APK links only
after the new site is live; previous APKs cannot be remotely made private.

## Development and checks

```powershell
npm ci
npm test
npm run build
npm run test:rules
npx wrangler deploy --dry-run
```

Rules tests require Java 21+ and Firebase's local emulator, and use a `demo-` project
without contacting production data. Browser checks use synthetic people and local
signed tokens; they do not substitute for the final live Google-login check.

The current Spark allowances are 50,000 document reads/day, 20,000 writes/day,
1 GiB stored data and 10 GiB/month outbound transfer. Rule checks can add document
reads. These differ from the earlier D1 estimates. Keep Spark and Workers Free;
quota exhaustion can interrupt access, without opting into paid overages.
