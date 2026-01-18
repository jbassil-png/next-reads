-- Next Reads - Initial Database Schema
-- This migration creates the core tables for tracking book releases and library availability

-- ============================================================================
-- TABLES
-- ============================================================================

-- Books table: Core tracking of book releases
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
  -- Possible values:
  --   'not_released' - Book hasn't come out yet
  --   'not_available' - Released but library doesn't have it
  --   'available_to_hold' - Can place a hold
  --   'on_hold' - You've placed a hold
  --   'available_to_checkout' - Ready for you to borrow
  --   'checked_out' - You borrowed it (will be hidden from dashboard)

  -- Tracking
  last_checked_at TIMESTAMPTZ,  -- When Overdrive was last checked
  hold_placed_at TIMESTAMPTZ,   -- When you placed the hold
  notified_at TIMESTAMPTZ,      -- Last email notification sent

  -- Metadata
  notes TEXT,  -- Personal notes
  cover_url TEXT,  -- Book cover image URL

  -- Future Fields (not implemented in UI yet)
  series_name TEXT,  -- e.g., "The Expanse"
  series_order INTEGER,  -- Book #3 in series
  anticipation_score INTEGER CHECK (anticipation_score >= 1 AND anticipation_score <= 5),
  -- 1 = Mildly interested, 5 = Must read immediately

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Status History: Track all status changes for debugging and analytics
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT,  -- 'manual' | 'overdrive_api' | 'admin_panel'
  notes TEXT  -- Optional context about why status changed
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Books table indexes
CREATE INDEX idx_books_release_date ON books(release_date);
CREATE INDEX idx_books_library_status ON books(library_status);
CREATE INDEX idx_books_isbn ON books(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX idx_books_overdrive_id ON books(overdrive_id) WHERE overdrive_id IS NOT NULL;

-- Status history indexes
CREATE INDEX idx_status_history_book_id ON status_history(book_id);
CREATE INDEX idx_status_history_changed_at ON status_history(changed_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on books table
CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically log status changes to status_history
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if library_status actually changed
  IF (TG_OP = 'UPDATE' AND OLD.library_status IS DISTINCT FROM NEW.library_status) THEN
    INSERT INTO status_history (book_id, old_status, new_status, source)
    VALUES (NEW.id, OLD.library_status, NEW.library_status, 'system');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-log status changes
CREATE TRIGGER log_book_status_changes
  AFTER UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION log_status_change();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;

-- Books table policies
-- Anyone can read (public dashboard)
CREATE POLICY "Public read access on books"
  ON books FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (true);

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (true);

-- Status history policies
-- Anyone can read status history (transparency)
CREATE POLICY "Public read access on status_history"
  ON status_history FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only authenticated users can insert (manual entries)
CREATE POLICY "Authenticated users can insert status_history"
  ON status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS (Documentation in database)
-- ============================================================================

COMMENT ON TABLE books IS 'Core table tracking book releases and library availability';
COMMENT ON TABLE status_history IS 'Audit log of all library status changes';

COMMENT ON COLUMN books.library_status IS 'Current availability status in SFPL Overdrive';
COMMENT ON COLUMN books.last_checked_at IS 'Last time Overdrive API was queried for this book';
COMMENT ON COLUMN books.anticipation_score IS 'Personal rating 1-5 of how excited you are for this release';

COMMENT ON COLUMN status_history.source IS 'How the status changed: manual, overdrive_api, admin_panel, or system';
