import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Format date as "Jan 23, 2024"
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

    // Get secrets
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!
    const userEmail = Deno.env.get('USER_EMAIL')!

    if (!resendApiKey || !userEmail) {
      throw new Error('Missing RESEND_API_KEY or USER_EMAIL environment variables')
    }

    // Calculate date ranges
    const today = new Date()
    const oneWeekFromNow = new Date(today)
    oneWeekFromNow.setDate(today.getDate() + 7)
    const oneWeekAgo = new Date(today)
    oneWeekAgo.setDate(today.getDate() - 7)

    // Query 1: Books releasing in the next 7 days
    const { data: upcomingBooks, error: upcomingError } = await supabase
      .from('books')
      .select('*')
      .gte('release_date', today.toISOString().split('T')[0])
      .lte('release_date', oneWeekFromNow.toISOString().split('T')[0])
      .order('release_date', { ascending: true })

    if (upcomingError) {
      throw upcomingError
    }

    // Query 2: Books that changed status in the last 7 days
    const { data: statusChanges, error: statusError } = await supabase
      .from('status_history')
      .select('book_id, old_status, new_status, changed_at')
      .gte('changed_at', oneWeekAgo.toISOString())
      .order('changed_at', { ascending: false })

    if (statusError) {
      throw statusError
    }

    // Get book details for status changes
    const bookIds = [...new Set(statusChanges?.map(sc => sc.book_id) || [])]
    const { data: changedBooks, error: changedBooksError } = await supabase
      .from('books')
      .select('*')
      .in('id', bookIds)

    if (changedBooksError) {
      throw changedBooksError
    }

    // Create a map of book_id to book details
    const bookMap = new Map(changedBooks?.map(book => [book.id, book]) || [])

    // Combine status changes with book details and deduplicate
    const statusChangesWithBooks = statusChanges
      ?.map(sc => ({
        ...sc,
        book: bookMap.get(sc.book_id)
      }))
      .filter(sc => sc.book) // Only include if we have book details
      .reduce((acc, sc) => {
        // Keep only the most recent change per book
        const existing = acc.find(item => item.book_id === sc.book_id)
        if (!existing || new Date(sc.changed_at) > new Date(existing.changed_at)) {
          return [...acc.filter(item => item.book_id !== sc.book_id), sc]
        }
        return acc
      }, [] as any[]) || []

    // Skip email if nothing to report
    if ((!upcomingBooks || upcomingBooks.length === 0) &&
        (!statusChangesWithBooks || statusChangesWithBooks.length === 0)) {
      console.log('No upcoming releases or status changes - skipping email')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No updates to report',
          skipped: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build HTML email
    let emailHtml = `
      <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0a0a0a; margin-bottom: 24px;">📚 Next Reads Weekly Summary</h1>
    `

    // Upcoming releases section
    if (upcomingBooks && upcomingBooks.length > 0) {
      emailHtml += `
        <h2 style="color: #0a0a0a; font-size: 18px; margin-top: 32px; margin-bottom: 16px;">📅 Releasing This Week</h2>
        <ul style="list-style: none; padding: 0;">
      `
      for (const book of upcomingBooks) {
        emailHtml += `
          <li style="margin-bottom: 12px; padding: 12px; background: #fafafa; border-radius: 6px;">
            <strong style="color: #0a0a0a;">${book.title}</strong> by ${book.author}
            <br>
            <span style="color: #737373; font-size: 14px;">${formatDate(book.release_date)}</span>
          </li>
        `
      }
      emailHtml += `</ul>`
    }

    // Status changes section
    if (statusChangesWithBooks && statusChangesWithBooks.length > 0) {
      emailHtml += `
        <h2 style="color: #0a0a0a; font-size: 18px; margin-top: 32px; margin-bottom: 16px;">📖 Library Updates</h2>
        <ul style="list-style: none; padding: 0;">
      `
      for (const change of statusChangesWithBooks) {
        const book = change.book
        emailHtml += `
          <li style="margin-bottom: 12px; padding: 12px; background: #fafafa; border-radius: 6px;">
            <strong style="color: #0a0a0a;">${book.title}</strong>
            <br>
            <span style="color: #737373; font-size: 14px;">
              ${formatStatus(change.old_status)} → ${formatStatus(change.new_status)}
            </span>
        `

        // Add Overdrive link if available and book is holdable/available
        if (book.overdrive_id && (book.library_status === 'available_to_hold' || book.library_status === 'available_to_checkout')) {
          emailHtml += `
            <br>
            <a href="https://sfpl.overdrive.com/media/${book.overdrive_id}"
               style="color: #0a0a0a; text-decoration: underline; font-size: 14px; margin-top: 4px; display: inline-block;">
              View on Overdrive →
            </a>
          `
        }

        emailHtml += `
          </li>
        `
      }
      emailHtml += `</ul>`
    }

    emailHtml += `
        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5;">
          <a href="https://jbassil-png.github.io/next-reads/"
             style="color: #0a0a0a; text-decoration: none; font-weight: 500;">
            View Full Dashboard →
          </a>
        </div>
      </div>
    `

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Next Reads <onboarding@resend.dev>',
        to: userEmail,
        subject: '📚 Next Reads Weekly Summary',
        html: emailHtml
      })
    })

    if (!resendResponse.ok) {
      const error = await resendResponse.text()
      throw new Error(`Resend API error: ${error}`)
    }

    const resendData = await resendResponse.json()
    console.log('Email sent successfully:', resendData)

    return new Response(
      JSON.stringify({
        success: true,
        emailId: resendData.id,
        upcomingCount: upcomingBooks?.length || 0,
        statusChangesCount: statusChangesWithBooks?.length || 0
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
