import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(() => new Response(JSON.stringify({ error: 'Endpoint em implementação.' }), {
  status: 503,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
}));
