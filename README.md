# Next Reads

Next Reads is a browser-based personal dashboard for tracking upcoming book releases.

It is intentionally built as a **static, incremental system** with no backend (so far), hosted on **GitHub Pages**, and designed to favor transparency, portability, and manual control over automation.

---

## What Next Reads Does

- Track upcoming book releases by **Title + Author**
- Validate books via the **Google Books API**
- Normalize release dates with explicit precision handling:
  - `YYYY` → stored as `YYYY-12-31` (precision: year)
  - `YYYY-MM` → stored as `YYYY-MM-01` (precision: month)
  - `YYYY-MM-DD` → stored exactly (precision: day)
- Display a dashboard split into three always-visible sections:
  - **Published** (release date in the past)
  - **Coming Soon** (within the next 30 days)
  - **Coming Later** (more than 30 days away)
- Track library availability status (Found / Not found / Unknown)
- Track reminder state (30d, 14d, 7d, 1d, release day)
- Allow manual marking of reminder events to avoid duplicates

---

## Architecture (Current)

- **Frontend only**: vanilla HTML, CSS, and JavaScript
- **Hosting**: GitHub Pages
- **No backend**
- **No frameworks**
- **No build step**

### Source of Truth
- `books.json` in the repository is the canonical dataset
- The app loads this file at runtime

### Draft Model
- New books and edits are stored temporarily in `localStorage` as a **Draft**
- Drafts are intentionally ephemeral
- The user explicitly decides when to commit changes

---

## Saving Changes (Current Workflow)

Because GitHub Pages is static, the app **cannot write to `books.json` directly**.

The current workflow is:

1. Add or edit books in the app (stored locally as Draft)
2. Click **Generate updated books.json**
3. Click **Download books.json**
4. Upload/replace `books.json` in the GitHub repo
5. Commit the change

This preserves:
- Full user control
- Version history via Git
- Zero credentials stored in the browser

---

## Data Model (Stable)

Each book follows this structure:

```json
{
  "title": "",
  "author": "",
  "release_date": "YYYY-MM-DD",
  "release_date_precision": "year|month|day",
  "release_date_raw": "",
  "source": "google_books|manual",
  "library": {
    "status": "unknown|not_found|found",
    "checked_at": null
  },
  "notifications": {
    "on_release": true,
    "on_library": true
  },
  "reminder_flags": {
    "30d": false,
    "14d": false,
    "7d": false,
    "1d": false,
    "release_day": false
  }
}
