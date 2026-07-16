# Match Log

Private TCG match tracker & loss review tool. A no-backend PWA: all data lives in your browser's local storage, per device, per person. Nothing is ever sent anywhere.

## Deploy (GitHub Pages, ~5 minutes)

1. Create a new repository on GitHub (e.g. `match-log`). Public is fine, the app contains no data, only code.
2. Upload every file in this folder to the repo root (keep the `icons/` folder structure). Either drag-and-drop on github.com ("Add file > Upload files") or:
   ```
   git init
   git add .
   git commit -m "Match Log v1"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/match-log.git
   git push -u origin main
   ```
3. In the repo: **Settings > Pages > Source: Deploy from a branch > Branch: main / (root) > Save**.
4. Wait a minute. Your app is live at `https://YOUR_USERNAME.github.io/match-log/`.

## Install on your phone

- **Android (Chrome):** open the URL, menu (⋮) > "Add to Home screen" / "Install app".
- **iPhone (Safari):** open the URL, Share button > "Add to Home Screen".

It opens full-screen with its own icon and works offline after the first load.

## Important notes

- **Data is per device and per browser.** Your phone's log and your laptop's log are separate. Use Export/Import in the Backup section to move data between devices.
- **Export a backup regularly.** Local storage is durable on an installed PWA, but a backup file is the only real insurance. The export is a plain JSON file; import skips duplicates automatically.
- **Updating the app:** if you change the code later, bump the cache name in `sw.js` (`matchlog-v1` → `matchlog-v2`) so installed copies pick up the new version.

## Files

- `index.html` — app shell and form
- `style.css` — ship's log theme
- `app.js` — all logic (storage, stats, backup)
- `manifest.json` + `sw.js` + `icons/` — the PWA machinery that makes it installable and offline-capable
