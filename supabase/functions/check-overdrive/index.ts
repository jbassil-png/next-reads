import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Normalize title for matching (remove punctuation, articles, extra spaces)
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^(a|an|the)\s+/i, '') // Remove leading articles
    .trim()
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get all books that have been released (to check library status)
    const today = new Date().toISOString().split('T')[0]
    const { data: books, error: fetchError } = await supabase
      .from('books')
      .select('*')
      .lte('release_date', today)
      .in('library_status', ['not_available', 'available_to_hold', 'on_hold'])

    if (fetchError) {
      throw fetchError
    }

    console.log(`Checking ${books?.length || 0} books...`)

    const results = []

    for (const book of books || []) {
      try {
        // Search Overdrive by title (more reliable than ISBN for matching across editions)
        const query = encodeURIComponent(book.title)
        const searchUrl = `https://thunder.api.overdrive.com/v2/libraries/sfpl/media?query=${query}`
        const searchResponse = await fetch(searchUrl)

        if (!searchResponse.ok) {
          console.error(`Overdrive search failed for ${book.title}: ${searchResponse.status}`)
          results.push({ title: book.title, status: 'search_failed' })
          continue
        }

        const searchData = await searchResponse.json()

        if (!searchData.items || searchData.items.length === 0) {
          console.log(`No Overdrive results for ${book.title}`)
          results.push({ title: book.title, status: 'not_found_in_overdrive' })
          continue
        }

        // Find best match using multiple strategies:
        // 1. If we have all_isbns, try to match by ISBN
        // 2. Fall back to normalized title matching
        let overdriveBook = searchData.items[0]

        if (book.all_isbns && book.all_isbns.length > 0) {
          // Try to find a match by ISBN
          const isbnMatch = searchData.items.find((item: any) => {
            const overdriveIsbns = item.formats?.map((f: any) => f.isbn).filter(Boolean) || []
            return book.all_isbns.some((ourIsbn: string) =>
              overdriveIsbns.some((odIsbn: string) => odIsbn === ourIsbn)
            )
          })

          if (isbnMatch) {
            console.log(`ISBN match found for ${book.title}`)
            overdriveBook = isbnMatch
          } else {
            console.log(`No ISBN match for ${book.title}, using title match`)
          }
        }

        // If no ISBN match, use normalized title matching
        if (!overdriveBook || overdriveBook === searchData.items[0]) {
          const normalizedBookTitle = normalizeTitle(book.title)
          const titleMatch = searchData.items.find((item: any) =>
            normalizeTitle(item.title) === normalizedBookTitle
          )
          if (titleMatch) {
            overdriveBook = titleMatch
          }
        }

        const isAvailable = overdriveBook.isAvailable === true
        const availableCopies = overdriveBook.availableCopies || 0
        const isHoldable = overdriveBook.isHoldable === true

        // Determine new library status
        let newStatus = book.library_status

        if (isAvailable && availableCopies > 0) {
          newStatus = 'available_to_checkout'
        } else if (isHoldable) {
          newStatus = 'available_to_hold'
        } else {
          newStatus = 'not_available'
        }

        // Only update if status changed
        if (newStatus !== book.library_status) {
          const { error: updateError } = await supabase
            .from('books')
            .update({
              library_status: newStatus,
              last_checked_at: new Date().toISOString()
            })
            .eq('id', book.id)

          if (updateError) {
            console.error(`Failed to update ${book.title}:`, updateError)
            results.push({ title: book.title, status: 'update_failed', error: updateError.message })
          } else {
            console.log(`Updated ${book.title}: ${book.library_status} → ${newStatus}`)
            results.push({
              title: book.title,
              oldStatus: book.library_status,
              newStatus: newStatus,
              availableCopies: availableCopies,
              holdsCount: overdriveBook.holdsCount || 0
            })
          }
        } else {
          // Still update last_checked_at even if status unchanged
          await supabase
            .from('books')
            .update({ last_checked_at: new Date().toISOString() })
            .eq('id', book.id)

          results.push({
            title: book.title,
            status: 'no_change',
            currentStatus: newStatus
          })
        }

      } catch (error) {
        console.error(`Error checking ${book.title}:`, error)
        results.push({ title: book.title, status: 'error', error: error.message })
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: books?.length || 0,
        results: results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Edge Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
