# Middle School Teaching Console

This project provides a Firebase-backed gradebook and planning console designed for a single teacher managing nine middle-school groups (five groups in 8th grade and four groups in 9th grade). The interface works on the web and can be embedded inside a web-view for mobile distribution.

## Features

- **Firebase integration** – Sign in anonymously or with a custom token and store data under your Firebase project.
- **Grade & group switcher** – Toggle between the 8th and 9th grade cohorts and instantly filter the student list.
- **Manual roster management** – Add, edit, and delete students directly from the table with real-time Firestore updates.
- **Prepared dataset upload** – Populate Firestore with all 313 students extracted from the official PDFs with a single click.
- **PDF roster extraction** – Drop a PDF roster to parse student names and IDs, review the results, and merge them into the active group.
- **Time table library** – Upload group-specific time table PDFs, download them later, or remove outdated files.
- **Lesson notebook** – Keep lesson summaries or reminders per group with automatic syncing to Firestore.
- **CSV export** – Download the current roster with the latest marks for offline reporting.

## Getting started

1. **Configure Firebase:** update `config.js` (or provide the values via deployment secrets) so it sets the global `__firebase_config` JSON before `index.html` loads. Optionally provide `__initial_auth_token` to authenticate with a custom token instead of anonymous auth. Set `__app_id` to isolate data sets.
2. **Host the files:** deploy `index.html`, `config.js`, `assets/styles.css`, and `src/app.js` on any static hosting provider.
3. **Open the app:** choose a grade and group, then begin uploading rosters, editing marks, or saving lesson notes.

### Deploying to GitHub Pages

The repository includes a GitHub Actions workflow that can publish the static site automatically.

1. In your GitHub repository, add the following secrets (Settings → Secrets and variables → Actions):
   - `FIREBASE_CONFIG_JSON` – the full Firebase config object, e.g. `{ "apiKey": "…", "authDomain": "…" }`.
   - `APP_ID` – optional; overrides the default `default-gradebook-app` namespace used in Firestore.
   - `CUSTOM_AUTH_TOKEN` – optional; provide a Firebase custom auth token if you do not want to rely on anonymous sign-in.
2. Enable GitHub Pages from the repository settings and choose the "GitHub Actions" source.
3. Push to the `main` branch (or run the workflow manually). The action runs the unit tests, generates `config.js` from your secrets, uploads the site, and deploys it to Pages.
4. Visit the URL shown in the workflow summary to access your hosted console.

## Development notes

- PDF parsing relies on [`pdfjs-dist`](https://github.com/mozilla/pdf.js). Because school PDFs vary in layout, double-check the preview before importing.
- Time table PDFs are stored directly in Firestore as Base64 strings. For large documents consider moving to Firebase Storage and saving download URLs instead.
- The UI is styled with Tailwind CSS (CDN) plus additional utility classes in `assets/styles.css`.
- To adapt the marking scheme, adjust the columns and score calculation inside `src/app.js`.

## Testing

Install Node.js 18+ and run the unit suite with:

```bash
npm test
```

## License

This repository is intended for the requesting teacher's internal use. No explicit license has been applied.
