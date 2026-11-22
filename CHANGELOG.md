# Changelog

### Unreleased
- Automated server and browser tests (`npm test`), run by GitHub on every push
- Data, photo and temp folders can be set with `DATA_DIR`, `UPLOADS_DIR` and `UPLOAD_TMP_DIR`
- README rewritten with current screenshots; changelog moved here

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
- Completion log ratings were always saved as 0: star rating input is now wired up correctly for both new logs and the initial log on puzzle creation
- Added missing star rating UI to the completion log modal and initial log section
- Rating is now correctly restored when editing an existing log entry
- Custom fields always failed with a 400 error: server was expecting a field named `label` but the client was sending `name`; both sides now use `name`
- Thumbnail index could go out of bounds after deleting an image (especially if the deleted image came before the thumbnail); server now clamps the index after deletion, and the client renders defensively as well
- Image upload errors were silently treated as success; the handler now checks the response status and shows an error alert on failure
- XSS: added `escapeHtml()` and applied it to all user-supplied data rendered into the page (puzzle names, brands, themes, notes, custom field values, wishlist fields, etc.)
- Wishlist product links are now only rendered as clickable anchors if the URL starts with `http://` or `https://`, preventing `javascript:` URL injection
- Image gallery onclick handlers no longer inject image URLs directly into HTML attribute strings; they now use index-based lookup to avoid attribute injection

**New features:**
- Dark mode toggle added to Settings → Theme section; preference is saved in `localStorage` and persists across sessions

### SEHv1.01 - initial release
- Initial public release
