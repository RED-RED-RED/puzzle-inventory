# 🧩 Puzzle Inventory App

A web-based inventory system for tracking jigsaw puzzles. Runs on Node.js with a small Express server and stores everything as JSON files, so there is no database to manage.

**Version:** SEHv1.06

---

![Dashboard](screenshots/dashboard.png)

---

## Quick Start (try it locally)

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying on Linux (recommended)

Works on Ubuntu or Debian: a normal server, a VM, or a Proxmox container (CT).

### Proxmox container

Create an **Ubuntu 24.04 CT**: unprivileged, nesting on (the default), 1 core, 1 GB RAM, 16 GB disk, and a static IP or DHCP reservation. Then in its console, as root:

```bash
apt update && apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
git clone https://github.com/RED-RED-RED/puzzle-inventory.git
cd puzzle-inventory
bash install.sh
```

Take a CT snapshot before each update so you can roll back in one click.

### Any other Ubuntu/Debian machine

Same steps, with `sudo` in front of the `apt`, `bash` and `curl | bash` commands.

### What the installer does

It installs the app to `/opt/puzzle-inventory`, runs it as a dedicated `puzzle` system user under systemd (starts on boot, restarts on crash), sets up a nightly backup, and checks that the app answers before it finishes. It prints the address to open.

Options go in front of the command, for example `sudo PORT=8080 BACKUP_DIR=/mnt/nas/puzzles bash install.sh`:

| Option | Default |
|--------|---------|
| `PORT` | `3000` |
| `BACKUP_DIR` | `/var/backups/puzzle-inventory` |
| `APP_DIR` | `/opt/puzzle-inventory` |
| `APP_USER` | `puzzle` |

### Updating

```bash
cd puzzle-inventory
git pull
sudo bash install.sh
```

Re-running the installer updates the code and restarts the app. It never touches `data/` or `uploads/` in the install folder. Pass the same options again if you used any.

### Managing the service

```bash
sudo systemctl status puzzle-inventory      # is it running?
sudo systemctl restart puzzle-inventory     # restart
sudo journalctl -u puzzle-inventory -f      # live logs
```

### Monitoring

`GET /api/health` returns `200 {"status":"ok",...}` when the app is up and its data files are readable, and `503` otherwise. Point Uptime Kuma (or similar) at `http://<server>:3000/api/health`.

---

## Using it on a phone

Open the app's address in the phone's browser, then add it to the home screen:

- **iPhone:** Safari > Share > **Add to Home Screen**. It opens full screen with its own icon.
- **Android:** Chrome > menu > **Add to Home screen** (or **Install app**). Over plain `http://` Chrome adds a shortcut that opens in a browser tab; a full-screen install needs HTTPS.

The phone needs to be on your home network (or connected by VPN, such as Tailscale) to reach the app. If it can't, it shows a "can't reach the server" page instead of a browser error (on HTTPS).

---

## Backups

There are two kinds, and they do different jobs.

**Nightly server backup (photos included).** A systemd timer archives `data/` and `uploads/` every night at about 2:30 AM to `/var/backups/puzzle-inventory/`, keeping the last 14. This is the one to rely on.

```bash
sudo systemctl start puzzle-inventory-backup     # run a backup now
ls -lh /var/backups/puzzle-inventory/            # see backups
systemctl list-timers puzzle-inventory-backup    # next scheduled run
```

To restore one:

```bash
sudo systemctl stop puzzle-inventory
sudo tar -xzf /var/backups/puzzle-inventory/puzzle-inventory-<date>.tar.gz -C /opt/puzzle-inventory
sudo systemctl start puzzle-inventory
```

These archives live on the same disk as the app. For real protection, copy them somewhere else (a NAS, another machine, cloud storage). The simplest way is to install with `BACKUP_DIR` pointing at a mounted network share: `sudo BACKUP_DIR=/mnt/nas/puzzles bash install.sh`.

**In-app backup (Settings > Download Backup).** Downloads a JSON file with all puzzle data, logs, custom fields, wishlist, settings and theme. It does not include the photo files themselves. Restoring it replaces all current data in one step and saves a copy of what was there to `data/pre-restore-<timestamp>/` first. Photos reappear automatically if the `uploads/` folder is still on the server.

---

## Features

- **Puzzle management**: name, brand, piece count, theme, series/set, artist, finished size, cut style, location and source
- **Photos**: upload several per puzzle, pick a thumbnail, rotate, replace or delete. Phone photos are auto-rotated, resized to 1200px and compressed. JPEG, PNG, WebP and GIF are supported, up to 25 MB each.
- **Completion logs**: date, time taken (optional), rating and notes for every completion. Edit or delete any entry.
- **Ratings**: 1 to 5 stars per puzzle and per completion
- **Puzzle Quality Score**: a 10-metric weighted score (0 to 100)
- **Status flags**: condition, passes pickup test, missing pieces, puzzle dust level, donated
- **Wishlist** with priority, price and product link
- **Custom fields**: any extra name/value pairs per puzzle
- **Search, sort and filter**: search by name, brand, theme, series or artist; sort by newest, name, pieces, rating, quality score or last completed; filter by status or brand
- **Pick One for Me**: picks a random puzzle, optionally limited by piece count and skipping completed, donated or incomplete puzzles
- **Wishlist to collection**: "Got It" moves a wishlist item into the collection with its details filled in
- **CSV export** of puzzles and wishlist for Excel, Numbers or Google Sheets
- **Statistics** for each puzzle and across the collection
- **Appearance**: warm or cool gray, a choice of accent colors, and a charcoal dark mode
- **Phone friendly**: compact layout on phones, and it can be added to the home screen like an app
- **Managed dropdowns** for brands, themes and series/sets, editable in Settings

---

## Project Structure

```
puzzle-inventory/
├── server.js                  # Express server: API, file storage, image processing
├── package.json
├── install.sh                 # Install/update on Linux with systemd
├── deploy/
│   ├── puzzle-inventory.service          # App service template
│   ├── puzzle-inventory-backup.service   # Backup job template
│   ├── puzzle-inventory-backup.timer     # Nightly schedule
│   └── backup.sh                         # Archives data/ and uploads/
├── public/
│   ├── index.html             # Frontend UI
│   ├── styles.css             # All styling (gray tones, dark mode, phone layout)
│   ├── app.js                 # Frontend logic
│   ├── fonts/                 # Young Serif and Nunito Sans (SIL Open Font License)
│   ├── manifest.webmanifest   # Home-screen app settings
│   ├── sw.js                  # Service worker (offline page only)
│   ├── offline.html           # Shown when the server can't be reached
│   └── icons/                 # App icons
├── data/                      # Created at runtime (not in git)
│   ├── puzzles.json
│   ├── settings.json
│   ├── wishlist.json
│   └── theme.json
└── uploads/puzzles/           # Uploaded photos (not in git)
```

### How data is kept safe

- Every change is a locked read-modify-write, so simultaneous saves from two devices cannot overwrite each other.
- Files are written to a temp file, flushed to disk, then renamed into place. A crash or power cut leaves either the old file or the new one, never a half-written one.
- If a data file is ever corrupt, the app refuses to save over it and will not start until it is fixed, so nothing is silently lost.

---

## Security note

There is no login. Anyone who can reach port 3000 can view and change the data. Keep it on a trusted home network and do not port-forward it to the internet. If you need remote access, use a VPN (WireGuard, Tailscale) rather than exposing the port.

---

## API Reference

All endpoints return JSON. Errors come back as `{ "error": "message" }` with an appropriate HTTP status.

### Puzzles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/puzzles` | List all puzzles |
| GET | `/api/puzzles/:id` | Get one puzzle |
| POST | `/api/puzzles` | Create a puzzle (name and pieces required) |
| PUT | `/api/puzzles/:id` | Update puzzle details |
| DELETE | `/api/puzzles/:id` | Delete a puzzle and its photos |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/puzzles/:id/images` | Upload up to 20 images (multipart, field `images`; optional `replaceIndex` with one image) |
| DELETE | `/api/puzzles/:id/images/:index` | Delete an image by index |
| PUT | `/api/puzzles/:id/thumbnail` | `{ thumbnailIndex }` |

### Completion Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/puzzles/:id/logs` | `{ date: "YYYY-MM-DD", time, rating, notes }`. `time` is in hours; 0 or omitted means not timed. |
| PUT | `/api/puzzles/:id/logs/:logId` | Edit a log entry (same fields) |
| DELETE | `/api/puzzles/:id/logs/:logId` | Delete a log entry |

### Single-field updates

| Method | Endpoint | Body |
|--------|----------|------|
| PUT | `/api/puzzles/:id/notes` | `{ notes }` |
| PUT | `/api/puzzles/:id/condition` | `{ condition }` |
| PUT | `/api/puzzles/:id/passes-pickup` | `{ passesPickup }` |
| PUT | `/api/puzzles/:id/missing-pieces` | `{ missingPieces, missingPieceCount }` |
| PUT | `/api/puzzles/:id/puzzle-dust` | `{ puzzleDust }` |
| PUT | `/api/puzzles/:id/donated` | `{ donated }` |
| PUT | `/api/puzzles/:id/quality` | `{ ...quality metrics, qualityScore }` |

### Custom Fields

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/puzzles/:id/custom-fields` | `{ name, value }` (both required) |
| DELETE | `/api/puzzles/:id/custom-fields/:fieldId` | Delete a custom field |

### Wishlist

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wishlist` | List all wishlist items |
| POST | `/api/wishlist` | Add an item (name required) |
| PUT | `/api/wishlist/:id` | Update an item |
| DELETE | `/api/wishlist/:id` | Delete an item |

### Settings, Theme, Restore

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Brands, themes and series lists |
| PUT | `/api/settings` | Replace all settings |
| POST | `/api/settings/:list` | `{ value }` adds to `brands`, `themes` or `series` |
| DELETE | `/api/settings/:list` | `{ value }` removes from that list |
| GET | `/api/health` | `200` when up and data is readable, `503` otherwise |
| GET | `/api/theme` | UI colors |
| PUT | `/api/theme` | `{ primary: "#rrggbb", tone: "warm" or "cool" }` (`primary` is the accent color) |
| POST | `/api/restore` | Replace all data from an in-app backup file (current data is copied to `data/pre-restore-*` first; a backup with no wishlist keeps the current one) |

---

## Changelog

### SEHv1.06 - 2026-11-21
**New look:**
- Calm gray design: warm or cool gray, with the puzzle photos as the main color. No more purple gradients.
- Puzzle page leads with a large photo next to the piece count, rating and completion history, with the details beside it
- Home shows the collection as a photo grid, with the stats in one compact row
- Settings > Appearance: choose warm or cool gray and an accent color (slate, charcoal, sage, teal, dusty rose, plum or custom). It syncs to every device; dark mode stays per device.
- New typefaces, hosted in the app so no internet is needed: Young Serif for puzzle names, Nunito Sans for everything else
- Clearer, shorter labels throughout (tabs are now Overview, Photos, Completions, Details, Stats)
- Gray app icon, and phone browser bars match the app
- Text contrast meets accessibility guidelines in every tone, light and dark

**Fixes:**
- Puzzle dust or condition values that aren't in the dropdown list now show instead of appearing blank
- On phones, the puzzle title is no longer hidden under the top bar after tapping a puzzle
- Anyone on one of the old color themes is moved to the new default automatically

### SEHv1.05 - 2026-11-21
**Phone and install:**
- Phone layout: compact header, search/filter/list fold into a "Browse puzzles" button, and tapping a puzzle jumps straight to it. Fields no longer make iPhone zoom in.
- Add to Home Screen support: app icon, full screen on iPhone, and an offline "can't reach the server" page over HTTPS
- Installer creates a dedicated `puzzle` user instead of running as root, supports `PORT`, checks the app actually answers before finishing, and handles Proxmox containers without nesting
- New `/api/health` endpoint for uptime monitors

**Bug fixes:**
- Some times showed as "1h 0m 60s" instead of "1h 1m"
- Photo uploads are processed from temp files instead of memory, so large batches can't run a small container out of RAM
- "Download Backup" could silently fail on Safari and iPhone
- Wishlist prices typed with "$" or text showed "$NaN USD"
- Restoring a backup with no wishlist emptied the current wishlist
- Brands, themes or series added on two devices at once could drop off the list
- Ratings on individual completions are now shown in the log list

### SEHv1.04 - 2026-11-15
**New features:**
- Wishlist "Got It" button opens Add Puzzle pre-filled from the wishlist item and removes it from the wishlist once saved
- "Pick One for Me" chooses a random puzzle, with optional piece range and options to skip completed, donated or incomplete puzzles
- Sort and filter the puzzle list (sort by newest, oldest, name, pieces, rating, quality score, recently completed, most completed; filter by not done, completed, donated, missing pieces, passes pickup test, or brand). Choices are remembered per browser.
- New puzzle fields: artist, finished size, cut style, and how many pieces are missing
- Export puzzles or wishlist to CSV from Settings (opens cleanly in Excel, including accented characters)
- Search now also matches artist

### SEHv1.03 - 2026-11-15
**Data safety:**
- Simultaneous saves could silently drop changes (in testing, only 4 of 20 parallel saves survived). All writes are now serialized through a lock.
- A corrupt or unreadable data file was treated as empty, so the next save wiped the collection. The app now refuses to overwrite it and will not start until it is fixed.
- Restoring a backup discarded every completion log and custom field and deleted all photo files. Restore is now a single server-side step that keeps logs, custom fields, quality scores and photo references, and saves the previous data first.
- Data files are flushed to disk before being swapped in, so a power cut cannot leave a half-written file.
- Re-running `install.sh` to update could copy an empty `data/` folder over the real one. The installer now never copies `data/` or `uploads/`.
- IDs are guaranteed unique even when created in the same millisecond.

**Bug fixes:**
- Completion dates showed one day early, and the default date jumped to tomorrow in the evening (UTC vs local time).
- Changing notes on the Additional Info tab and then using Edit Puzzle could revert the notes to the old value.
- A just-added completion log could not be edited until the page was reloaded.
- Quality score selections from the previously viewed puzzle carried over and could be saved to the next one.
- If the initial completion log failed when adding a puzzle, the form stayed open and saving again created a duplicate puzzle.
- Photos picked while editing a puzzle were silently ignored; they are now uploaded.
- Phone photos could appear sideways; they are now auto-rotated.
- Upload errors (file too large, unsupported format) returned an HTML error page instead of a readable message.
- Average ratings counted unrated puzzles and logs as 0 stars.
- Brand, theme or series names containing quotes broke their Delete button, and were not escaped in Settings or dropdowns.
- Search now includes series and keeps the filter when the list refreshes.

**Changes:**
- Logging a completion without a time is now allowed and shows as "Not timed"; it is left out of average and fastest time.
- Image limit raised to 25 MB each, 20 per upload.
- Nightly backup timer for data and photos (`deploy/`), with 14 days kept.
- Installer detects Node (including nvm installs), checks the version, and works as an updater.
- Removed unused PQI code and the `/api/puzzles/:id/pqi` endpoint (the Quality Score section is the one in use).
- `PORT` and `HOST` can be set by environment variable.

### SEHv1.02 - 2026-03-11
**Bug fixes:**
- Completion log ratings were always saved as 0 — star rating input is now wired up correctly for both new logs and the initial log on puzzle creation
- Added missing star rating UI to the completion log modal and initial log section
- Rating is now correctly restored when editing an existing log entry
- Custom fields always failed with a 400 error — server was expecting a field named `label` but the client was sending `name`; both sides now use `name`
- Thumbnail index could go out of bounds after deleting an image (especially if the deleted image came before the thumbnail); server now clamps the index after deletion, and the client renders defensively as well
- Image upload errors were silently treated as success; the handler now checks the response status and shows an error alert on failure
- XSS: added `escapeHtml()` and applied it to all user-supplied data rendered into the page (puzzle names, brands, themes, notes, custom field values, wishlist fields, etc.)
- Wishlist product links are now only rendered as clickable anchors if the URL starts with `http://` or `https://`, preventing `javascript:` URL injection
- Image gallery onclick handlers no longer inject image URLs directly into HTML attribute strings; they now use index-based lookup to avoid attribute injection

**New features:**
- Dark mode toggle added to Settings → Theme section; preference is saved in `localStorage` and persists across sessions

### SEHv1.01 - initial release
- Initial public release
