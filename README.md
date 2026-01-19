# Next Reads

A personal dashboard for tracking upcoming book releases with automated library availability monitoring.

**Status:** Active - Deployed on GitHub Pages with Supabase backend

---

## What Next Reads Does

Track book releases you're anticipating and automatically monitor their availability at San Francisco Public Library:

### Core Features

- **Two-table dashboard:**
  - **"Waiting For"** - Released books not yet available or on hold at the library
  - **"Coming Soon"** - Unreleased books sorted by release date

- **Smart book search:**
  - Autocomplete search by title or author using Google Books API
  - Automatic collection of all ISBNs from all editions
  - Deduplicated results showing one entry per unique book
  - Cover images displayed for all books

- **Automated Overdrive integration:**
  - Daily automated checks of library availability (8 AM via pg_cron)
  - Manual "Check Library Status" button for on-demand checks
  - Intelligent ISBN matching across different editions
  - Falls back to normalized title matching
  - Tracks availability status: Not Available / Available to Hold / Available to Checkout

- **One-click library access:**
  - Click any available book row to open it in Overdrive (new tab)
  - Direct links to place holds or check out books

- **Public sharing:**
  - Your dashboard is publicly viewable (read-only)
  - Authenticated admin access for adding/managing books
  - Open source for others to fork and deploy their own

---

## Architecture

**Current Stack:**
- **Frontend:** Vanilla HTML/CSS/JavaScript (single-page app)
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **APIs:** Google Books API (search), Overdrive Thunder API (availability)
- **Authentication:** Supabase Auth (admin-only, public read access)
- **Hosting:** GitHub Pages (frontend) + Supabase (data/functions)

**Database:**
- `books` table - All tracked releases with library status, ISBNs, and Overdrive links
- `status_history` table - Audit log of status changes
- Row Level Security - Public read, authenticated write

**Scheduled Tasks:**
- Daily Overdrive checks at 8 AM via pg_cron
- Checks all released books with status: not_available, available_to_hold, or on_hold
- Updates status and Overdrive links automatically

See [supabase/migrations/](supabase/migrations/) for database schema.

---

## Setup

### 1. Database Setup

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project
3. Enable pg_cron extension:
   - Go to Database → Extensions in Supabase dashboard
   - Search for "pg_cron" and enable it
4. Run migrations in order:
   ```sql
   -- In SQL Editor, run these files in order:
   -- 1. supabase/migrations/001_initial_schema.sql
   -- 2. supabase/migrations/002_add_all_isbns.sql
   ```

See [supabase/README.md](supabase/README.md) for detailed instructions.

### 2. Deploy Edge Function

The Overdrive checking Edge Function must be deployed:

1. Go to Supabase Dashboard → Edge Functions
2. Create new function named `check-overdrive`
3. Copy code from `supabase/functions/check-overdrive/index.ts`
4. Deploy the function

### 3. Set Up Scheduled Checks

Create a daily cron job in Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'daily-overdrive-check',
  '0 8 * * *', -- Daily at 8 AM
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/check-overdrive',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR-SERVICE-ROLE-KEY"}'::jsonb
  )
  $$
);
```

Replace `YOUR-PROJECT` and `YOUR-SERVICE-ROLE-KEY` with your values.

### 4. Configure Frontend

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

   const SUPABASE_ADMIN_CONFIG = {
     url: 'https://YOUR-PROJECT.supabase.co',
     serviceRoleKey: 'your-service-role-key'
   };
   ```

3. Deploy to GitHub Pages or open `index.html` locally

**Note:** `config.js` is gitignored - never commit your credentials!

### 5. Add Your First Books

1. Open the deployed dashboard
2. Authenticate (if using Supabase Auth)
3. Use the "Add to List" form at the top:
   - Start typing a book title or author name
   - Select from autocomplete suggestions
   - Review and confirm the book details
   - Click "Add to List"
4. Book will be automatically checked against Overdrive

---

## How It Works

### Adding Books

1. **Search:** Type a title or author - autocomplete shows results from Google Books
2. **Deduplicate:** Results are deduplicated by normalized title (one book, many editions)
3. **Collect ISBNs:** When you select a book, the system fetches all editions and collects all ISBNs
4. **Store:** Book is saved with primary ISBN + array of all ISBNs from all editions

### Library Checking

1. **Search Overdrive:** Query by title to find book in SFPL's catalog
2. **Match by ISBN:** If book has `all_isbns`, tries to match any ISBN with Overdrive's formats
3. **Fallback to Title:** If no ISBN match, uses normalized title matching
4. **Extract Status:** Determines if book is available to checkout, available to hold, or not available
5. **Store Link:** Saves Overdrive ID for one-click access

### Automated Updates

- Daily at 8 AM, Edge Function checks all relevant books
- Updates status and Overdrive links
- Books in "Waiting For" table show current availability

### Clicking Through

- Any book with status "Available to Hold" or "Available to Checkout" has a clickable row
- Hover shows blue highlight
- Click opens book in SFPL Overdrive in new tab
- Can immediately place hold or check out

---

## Development Status

**Phase 1: Core Dashboard** ✅
- [x] Database schema with books and status history
- [x] Two-table public view
- [x] Embedded add book functionality

**Phase 2: Overdrive Integration** ✅
- [x] Google Books API search with autocomplete
- [x] Multi-edition ISBN collection
- [x] Edge Function for availability checks
- [x] Scheduled daily checks via pg_cron
- [x] Intelligent ISBN + title matching
- [x] Clickable rows to Overdrive

**Phase 3: Polish & Features** 📋
- [ ] Email notifications when books become available
- [ ] Series tracking
- [ ] Mobile-optimized design
- [ ] Reading history / archive

---

## Project Structure

```
next-reads/
├── index.html                 # Dashboard with embedded add functionality
├── config.js                  # Your Supabase credentials (gitignored)
├── config.example.js          # Template for config
├── README.md                  # This file
└── supabase/
    ├── README.md              # Supabase setup guide
    ├── migrations/
    │   ├── 001_initial_schema.sql       # Core tables and RLS
    │   └── 002_add_all_isbns.sql        # ISBN array field
    └── functions/
        └── check-overdrive/
            └── index.ts       # Daily availability checking
```

---

## Technical Highlights

### ISBN Matching Strategy

The system collects ISBNs from all editions of a book because Google Books and Overdrive often have different editions:

- Google Books might return the hardcover ISBN
- Overdrive might only have the ebook ISBN
- By collecting all ISBNs from all editions, we maximize match probability

### Title Normalization

Titles are normalized for matching:
- Lowercase conversion
- Punctuation removal
- Article removal ("The", "A", "An")
- Whitespace normalization

This ensures "Vera, or Faith" matches "Vera Or Faith" and "The Lord of the Rings" matches "Lord of the Rings".

### Overdrive Thunder API

Uses the public Overdrive Thunder API:
- `https://thunder.api.overdrive.com/v2/libraries/sfpl/media?query={title}`
- Returns only books in SFPL's digital catalog
- No authentication required
- Includes availability, hold counts, and formats

---

## Contributing

This is a personal project, but if you want to:
- **Use it yourself:** Fork the repo and follow the setup instructions
- **Suggest improvements:** Open an issue
- **Report bugs:** Open an issue with details

---

## License

MIT License - feel free to fork and adapt for your own use.
