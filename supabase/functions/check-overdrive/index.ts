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

// Format status for display
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'not_released': 'Not Released',
    'not_available': 'Not Available',
    'available_to_hold': 'Available to Hold',
    'on_hold': 'On Hold',
    'available_to_checkout': 'Borrow',
    'checked_out': 'Checked Out'
  }
  return statusMap[status] || status
}

// Send email notification for status change
async function sendStatusChangeEmail(
  book: any,
  oldStatus: string,
  newStatus: string,
  resendApiKey: string,
  userEmail: string
): Promise<void> {
  try {
    const emailHtml = `
      <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0a0a0a; margin-bottom: 24px;">📚 Library Status Update</h1>

        <div style="background: #fafafa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h2 style="color: #0a0a0a; font-size: 18px; margin: 0 0 8px 0;">${book.title}</h2>
          <p style="color: #737373; margin: 0 0 16px 0;">by ${book.author}</p>

          <div style="background: white; border-radius: 6px; padding: 16px;">
            <p style="color: #737373; margin: 0 0 8px 0; font-size: 14px;">Status changed:</p>
            <p style="color: #0a0a0a; margin: 0; font-size: 16px;">
              <span style="text-decoration: line-through; color: #737373;">${formatStatus(oldStatus)}</span>
              →
              <strong>${formatStatus(newStatus)}</strong>
            </p>
          </div>
        </div>

        ${book.overdrive_id && (newStatus === 'available_to_hold' || newStatus === 'available_to_checkout') ? `
          <a href="https://sfpl.overdrive.com/media/${book.overdrive_id}"
             style="display: inline-block; background: #0a0a0a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-bottom: 24px;">
            ${newStatus === 'available_to_checkout' ? 'Borrow' : 'Place Hold'} on Overdrive →
          </a>
        ` : ''}

        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5;">
          <a href="https://jbassil-png.github.io/next-reads/"
             style="color: #0a0a0a; text-decoration: none; font-weight: 500;">
            View Full Dashboard →
          </a>
        </div>
      </div>
    `

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Next Reads <onboarding@resend.dev>',
        to: userEmail,
        subject: `📚 "${book.title}" is now ${formatStatus(newStatus)}`,
        html: emailHtml
      })
    })

    if (!resendResponse.ok) {
      const error = await resendResponse.text()
      console.error(`Failed to send email for ${book.title}:`, error)
    } else {
      const resendData = await resendResponse.json()
      console.log(`Email sent for ${book.title}:`, resendData.id)
    }
  } catch (error) {
    console.error(`Error sending email for ${book.title}:`, error)
    // Don't throw - we don't want email failures to break the main function
  }
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

    // Get email notification secrets
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const userEmail = Deno.env.get('USER_EMAIL')

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
        // Only store overdrive_id if we have a confident match
        let overdriveBook = null
        let matchFound = false

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
            matchFound = true
          }
        }

        // If no ISBN match, try normalized title matching
        if (!matchFound) {
          const normalizedBookTitle = normalizeTitle(book.title)
          const titleMatch = searchData.items.find((item: any) =>
            normalizeTitle(item.title) === normalizedBookTitle
          )
          if (titleMatch) {
            console.log(`Title match found for ${book.title}`)
            overdriveBook = titleMatch
            matchFound = true
          }
        }

        // If no confident match found, mark as not available and don't store overdrive_id
        if (!matchFound) {
          console.log(`No confident match for ${book.title} in Overdrive`)

          // Only update if current status is not already 'not_available'
          if (book.library_status !== 'not_available') {
            const { error: updateError } = await supabase
              .from('books')
              .update({
                library_status: 'not_available',
                overdrive_id: null,
                last_checked_at: new Date().toISOString()
              })
              .eq('id', book.id)

            if (updateError) {
              console.error(`Failed to update ${book.title}:`, updateError)
              results.push({ title: book.title, status: 'update_failed', error: updateError.message })
            } else {
              console.log(`Updated ${book.title}: ${book.library_status} → not_available (no match)`)

              // Send email notification if configured
              if (resendApiKey && userEmail) {
                await sendStatusChangeEmail(book, book.library_status, 'not_available', resendApiKey, userEmail)
              }

              results.push({
                title: book.title,
                oldStatus: book.library_status,
                newStatus: 'not_available',
                reason: 'no_confident_match'
              })
            }
          } else {
            results.push({ title: book.title, status: 'no_change', currentStatus: 'not_available' })
          }

          continue
        }

        const isAvailable = overdriveBook.isAvailable === true
        const availableCopies = overdriveBook.availableCopies || 0
        const isHoldable = overdriveBook.isHoldable === true
        const overdriveId = overdriveBook.id || null

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
              overdrive_id: overdriveId,
              last_checked_at: new Date().toISOString()
            })
            .eq('id', book.id)

          if (updateError) {
            console.error(`Failed to update ${book.title}:`, updateError)
            results.push({ title: book.title, status: 'update_failed', error: updateError.message })
          } else {
            console.log(`Updated ${book.title}: ${book.library_status} → ${newStatus}`)

            // Send email notification if configured
            if (resendApiKey && userEmail) {
              await sendStatusChangeEmail(book, book.library_status, newStatus, resendApiKey, userEmail)
            }

            results.push({
              title: book.title,
              oldStatus: book.library_status,
              newStatus: newStatus,
              availableCopies: availableCopies,
              holdsCount: overdriveBook.holdsCount || 0
            })
          }
        } else {
          // Still update last_checked_at and overdrive_id even if status unchanged
          await supabase
            .from('books')
            .update({
              last_checked_at: new Date().toISOString(),
              overdrive_id: overdriveId
            })
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
