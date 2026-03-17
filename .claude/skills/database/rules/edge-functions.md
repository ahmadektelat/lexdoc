# Edge Function Patterns

## File Structure

Edge functions live in `supabase/functions/<name>/index.ts`.

## File Header

```typescript
// CREATED: YYYY-MM-DD IST (Jerusalem)
// UPDATED: YYYY-MM-DD HH:MM IST (Jerusalem)
//          - Brief description of what changed
// <function-name> - Brief description
```

## Deno Imports

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
```

## CORS Headers

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
```

## Auth Check Pattern

```typescript
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ... business logic ...

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

## LexDoc-Specific Edge Functions

### Auto-Task Generation
When a filing deadline approaches (10 days before due_date), create a task:
```typescript
// Query filings where due_date is within 10 days and no task exists
const { data: upcomingFilings } = await supabaseAdmin
  .from('filings')
  .select('*')
  .eq('status', 'pending')
  .lte('due_date', tenDaysFromNow)
  .is('deleted_at', null);

// Create tasks for each filing without an existing linked task
for (const filing of upcomingFilings) {
  const { data: existingTask } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('filing_id', filing.id)
    .is('deleted_at', null)
    .single();

  if (!existingTask) {
    await supabaseAdmin.from('tasks').insert({
      firm_id: filing.firm_id,
      client_id: filing.client_id,
      filing_id: filing.id,
      title: `Filing due: ${filing.type} - ${filing.period_end}`,
      due_date: filing.due_date,
      auto_generated: true,
      status: 'pending',
      priority: 'high',
    });
  }
}
```

### Filing Deadline Reminders
Scheduled edge function to send reminders for upcoming filing deadlines.

## Admin Client (Service Role)

For operations that bypass RLS:
```typescript
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

## Response Patterns

```typescript
// Success
return new Response(
  JSON.stringify({ data: result }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

// Error
return new Response(
  JSON.stringify({ error: "Description" }),
  { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

## Deployment

Use Supabase MCP `deploy_edge_function` with `verify_jwt: true` (default).
Only disable JWT verification for webhooks that use custom auth.
