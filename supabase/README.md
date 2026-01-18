# Supabase Setup Guide

This directory contains database migrations and configuration for the Next Reads project.

## Initial Setup

### 1. Run the Database Migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (in the left sidebar)
3. Click **New Query**
4. Copy the contents of `migrations/001_initial_schema.sql`
5. Paste into the SQL editor
6. Click **Run** (or press Cmd/Ctrl + Enter)

You should see: `Success. No rows returned`

### 2. Verify Tables Were Created

1. Go to **Table Editor** (in the left sidebar)
2. You should see two tables:
   - `books`
   - `status_history`

### 3. Test Row Level Security

The tables are configured so:
- **Anonymous users** (public) can SELECT (read) data
- **Authenticated users** (you) can INSERT, UPDATE, DELETE

To test:
1. Go to **SQL Editor**
2. Run: `SELECT * FROM books;`
3. Should return empty result (no error = RLS is working)

## Environment Variables

You'll need to add these to your frontend application:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
```

**Important:** The `anon` key is safe to use in client-side code. Never commit the `service_role` key to git!

## What Was Created

### Tables

**`books`**
- Tracks all book releases you're monitoring
- Contains metadata (title, author, ISBN, etc.)
- Tracks library availability status
- Future-ready for series info and anticipation scores

**`status_history`**
- Audit log of all status changes
- Tracks when/how/why a book's status changed
- Useful for debugging Overdrive integration

### Automatic Features

1. **Auto-updating timestamp**: `updated_at` automatically updates on changes
2. **Status change logging**: Any change to `library_status` is automatically logged to `status_history`
3. **Row Level Security**: Public read access, admin-only writes

## Next Steps

After running the migration:
1. Create an auth user (yourself) in Supabase
2. Test adding a book via SQL
3. Connect the frontend to Supabase
