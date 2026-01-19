-- Add all_isbns array field to store ISBNs from all editions
-- This allows matching against any edition that Overdrive might have

-- Add the new column
ALTER TABLE books ADD COLUMN all_isbns TEXT[];

-- Create index for efficient array searching
CREATE INDEX idx_books_all_isbns ON books USING GIN (all_isbns);

-- Add comment for documentation
COMMENT ON COLUMN books.all_isbns IS 'Array of all ISBNs from all editions of this book (for Overdrive matching)';
