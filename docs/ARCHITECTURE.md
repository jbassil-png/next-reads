# Next Reads - Architecture Documentation

## Project Vision

A personal dashboard for tracking upcoming book releases with Overdrive library integration.

**Core Workflow:**
1. Add books you're anticipating (unreleased or recently released)
2. System checks SFPL Overdrive for availability
3. Dashboard shows two views:
   - **"Waiting For"** - Released books not yet available/on hold
   - **"Coming Soon"** - Unreleased books by date
4. Receive weekly email summary + alerts when books become available
5. When checked out, books automatically disappear from dashboard

**User Model:**
- Single user (you) with admin access
- Public read-only dashboard for others to view
- Open source for others to fork and deploy their own instance

---

## Database Schema

### Primary Table: `books`

```sql
CREATE TABLE books (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Book Info
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  release_date DATE NOT NULL,
  isbn TEXT,  -- For Overdrive lookup
  overdrive_id TEXT,  -- Extracted from Overdrive API
  google_books_id TEXT,  -- From Google Books validation

  -- Library Status
  library_status TEXT NOT NULL DEFAULT 'not_released',
  -- Current possible values:
  --   'not_released' - Book hasn't come out yet
  --   'not_available' - Released but library doesn't have it
  --   'available_to_hold' - Can place a hold
  --   'on_hold' - You've placed a hold
  --   'available_to_checkout' - Ready for you to borrow
  --   'checked_out' - You borrowed it (REMOVED FROM DASHBOARD)

  -- Tracking
  last_checked_at TIMESTAMPTZ,  -- When Overdrive was last checked
  hold_placed_at TIMESTAMPTZ,   -- When you placed the hold
  notified_at TIMESTAMPTZ,      -- Last email notification sent

  -- Metadata
  notes TEXT,  -- Personal notes
  cover_url TEXT,  -- Book cover image URL

  -- Future Fields (not implemented yet)
  series_name TEXT,  -- e.g., "The Expanse"
  series_order INTEGER,  -- Book #3 in series
  anticipation_score INTEGER CHECK (anticipation_score >= 1 AND anticipation_score <= 5),
  -- 1 = Mildly interested, 5 = Must read immediately

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_books_release_date ON books(release_date);
CREATE INDEX idx_books_library_status ON books(library_status);
CREATE INDEX idx_books_isbn ON books(isbn);
```

### Status History Table: `status_history`

Tracks every status change for debugging and analytics.

```sql
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT,  -- 'manual' | 'overdrive_api' | 'admin_panel'
  notes TEXT  -- Optional context about why status changed
);

CREATE INDEX idx_status_history_book_id ON status_history(book_id);
CREATE INDEX idx_status_history_changed_at ON status_history(changed_at DESC);
```

---

## Dashboard Queries

### "Waiting For" Table
Released books that are not yet checked out:

```sql
SELECT * FROM books
WHERE release_date <= CURRENT_DATE
  AND library_status IN ('not_available', 'available_to_hold', 'on_hold', 'available_to_checkout')
ORDER BY release_date DESC;
```

### "Coming Soon" Table
Unreleased books sorted by release date:

```sql
SELECT * FROM books
WHERE release_date > CURRENT_DATE
ORDER BY release_date ASC;
```

### Remove Checked Out Books
Books with `library_status = 'checked_out'` are excluded from both tables.

---

## Row Level Security (RLS)

**Public read access:** Anyone can view the dashboard
**Admin write access:** Only authenticated user (you) can modify

```sql
-- Enable RLS
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;

-- Public read for books
CREATE POLICY "Public read access on books"
  ON books FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated write for books
CREATE POLICY "Authenticated users can insert books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (true);

-- Public read for status history (transparency)
CREATE POLICY "Public read access on status_history"
  ON status_history FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only system/authenticated can write history
CREATE POLICY "Authenticated users can insert status_history"
  ON status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

---

## Technology Stack

**Frontend:**
- Vanilla HTML/CSS/JavaScript (for now)
- Supabase JavaScript client
- Hosted on GitHub Pages or Vercel

**Backend:**
- Supabase (PostgreSQL + Edge Functions + Auth)
- GitHub Actions (cron jobs for Overdrive checks)

**External Services:**
- SFPL Overdrive API (to be reverse-engineered)
- Email service: TBD (Resend, SendGrid, or AWS SES)
- Google Books API (for book validation/metadata)

---

## Overdrive Integration Plan

**Status:** Research phase

**Approach:**
1. Inspect SFPL Overdrive website network requests
2. Reverse engineer API endpoints
3. Implement as Supabase Edge Function
4. Run daily via GitHub Actions cron

**Fallback:**
- Manual status updates via admin panel
- Build core functionality first, automate later

---

## Future Enhancements

**Phase 2 Features:**
- Series tracking (group related books)
- Anticipation scores (prioritize what you're most excited about)
- Genre/tag filtering
- Reading history (archive of checked-out books)

**Phase 3 Features:**
- Direct hold placement from dashboard
- Mobile-friendly design
- Progressive Web App (PWA) support
- Export reading list

---

## Design Principles

1. **Simple first** - Manual workflow before automation
2. **Privacy-focused** - Single user, public read-only
3. **Open source** - Others can fork and self-host
4. **Learning project** - Document decisions for educational value
5. **Minimal dependencies** - Use platform features over external libraries
