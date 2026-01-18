# Next Reads

A personal dashboard for tracking upcoming book releases with library availability monitoring.

**Status:** Active development - migrated to Supabase backend

---

## What Next Reads Does

Track book releases you're anticipating and monitor their availability at your local library:

### Core Features
- **Two-table dashboard:**
  - **"Waiting For"** - Released books not yet available or on hold at the library
  - **"Coming Soon"** - Unreleased books sorted by release date

- **Library integration** (in progress):
  - Track availability status (Not Available / Available to Hold / On Hold / Available to Checkout)
  - Automatic Overdrive checking (planned)
  - Email alerts when books become available (planned)

- **Public sharing:**
  - Your dashboard is publicly viewable (read-only)
  - Admin panel for you to manage books
  - Open source for others to fork and deploy their own

---

## Architecture

**Current Stack:**
- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Authentication:** Simple admin-only (no auth required for viewing)
- **Hosting:** GitHub Pages (frontend) + Supabase (data/functions)

**Database:**
- `books` table - All tracked releases with library status
- `status_history` table - Audit log of status changes
- Row Level Security - Public read, authenticated write

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed schema and design decisions.

---

## Setup

### 1. Database Setup

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project
3. Run the migration from `supabase/migrations/001_initial_schema.sql`:
   - Go to SQL Editor in Supabase dashboard
   - Copy/paste the migration SQL
   - Run it

See [supabase/README.md](supabase/README.md) for detailed instructions.

### 2. Configure Frontend

1. Copy `config.example.js` to `config.js`:
   ```bash
   cp config.example.js config.js
   ```

2. Edit `config.js` with your Supabase credentials:
   ```javascript
   const SUPABASE_CONFIG = {
     url: 'https://YOUR-PROJECT.supabase.co',
     anonKey: 'your-anon-public-key'
   };
   ```

3. Open `index.html` in a browser

**Note:** `config.js` is gitignored - never commit your credentials!

### 3. Add Test Data

Open Supabase SQL Editor and run:

```sql
-- Add a book that's already released
INSERT INTO books (title, author, release_date, library_status)
VALUES ('The Name of the Wind', 'Patrick Rothfuss', '2007-03-27', 'not_available');

-- Add an upcoming release
INSERT INTO books (title, author, release_date, library_status, notes)
VALUES ('Doors of Stone', 'Patrick Rothfuss', '2026-12-31', 'not_released', 'Highly anticipated!');
```

Refresh your dashboard to see the books appear.

---

## Development Roadmap

**Phase 1: Core Dashboard** ✅
- [x] Database schema
- [x] Two-table public view
- [ ] Admin panel for adding/editing books

**Phase 2: Overdrive Integration** 🚧
- [ ] Research SFPL Overdrive API
- [ ] Edge Function for availability checks
- [ ] Scheduled daily checks

**Phase 3: Notifications** 📋
- [ ] Email service integration
- [ ] Weekly digest email
- [ ] Availability alerts

**Phase 4: Polish** 📋
- [ ] Series tracking
- [ ] Anticipation scores
- [ ] Mobile-friendly design
- [ ] Reading history

---

## Project Structure

```
next-reads/
├── index.html              # Public dashboard (two-table view)
├── admin.html              # Admin panel (coming soon)
├── config.js               # Your Supabase credentials (gitignored)
├── config.example.js       # Template for config
├── books.json              # Legacy data (deprecated)
├── docs/
│   └── ARCHITECTURE.md     # Detailed design docs
└── supabase/
    ├── README.md           # Setup guide
    └── migrations/
        └── 001_initial_schema.sql
```

---

## Why This Architecture?

**Learning First:**
This is a learning project that solves a real problem. The architecture choices balance:
- Educational value (learn Supabase, databases, APIs)
- Practical utility (actually use this tool)
- Simplicity (no over-engineering)

**Single User, Public Dashboard:**
- Only you can edit (admin panel)
- Anyone can view (public read-only dashboard)
- Others can fork and deploy their own instance

**See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full rationale.**

---

## Contributing

This is a personal project, but if you want to:
- **Use it yourself:** Fork the repo and follow the setup instructions
- **Suggest improvements:** Open an issue
- **Report bugs:** Open an issue with details

---

## License

MIT License - feel free to fork and adapt for your own use.
