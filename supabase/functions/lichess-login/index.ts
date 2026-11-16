// Log in with Lichess (docs/DECISIONS.md, "Accounts and sync").
//
// The app sends the OAuth code it got back from lichess.org (PKCE, no client secret: Lichess
// lets any app use OAuth without registering). This function swaps it for a Lichess token,
// reads who the account is, revokes the token straight away, and returns a one-time login for
// the matching Ply user (created on first login), which the app redeems with verifyOtp.
//
// The service-role key is only ever available here, on Supabase's servers, from the
// environment Supabase gives every function. It is never in the app or the repository.
//
// Deploy: supabase functions deploy lichess-login --no-verify-jwt
// (the app calls it before anyone is logged in; supabase/config.toml says the same)
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const LICHESS = 'https://lichess.org';
// where the app may send people back to (the OAuth redirect_uri must be one of these)
const ALLOWED = (Deno.env.get('PLY_REDIRECTS') ?? 'https://eben-vranken.github.io/ply/,http://localhost:5173/ply/,http://localhost:4173/ply/').split(',');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  let body: { code?: string; verifier?: string; redirectUri?: string; clientId?: string };
  try { body = await req.json(); } catch { return reply(400, { error: 'Bad request' }); }
  const { code, verifier, redirectUri, clientId } = body;
  if (!code || !verifier || !redirectUri || !clientId) return reply(400, { error: 'Missing code' });
  if (!ALLOWED.includes(redirectUri)) return reply(400, { error: 'Redirect not allowed' });

  const tok = await fetch(`${LICHESS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId })
  });
  if (!tok.ok) return reply(401, { error: 'Lichess did not accept the login' });
  const { access_token } = await tok.json();
  const acc = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${access_token}` } });
  // the token was only needed to learn who this is
  await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } }).catch(() => {});
  if (!acc.ok) return reply(401, { error: 'Could not read the Lichess account' });
  const { id, username } = await acc.json() as { id: string; username: string };
  if (!id) return reply(401, { error: 'Could not read the Lichess account' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  // a Lichess account is a Ply user with an address that never receives mail (.invalid is reserved)
  const email = `${id.toLowerCase()}@lichess.invalid`;
  const meta = { lichess_id: id, lichess_username: username };
  const made = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
  if (made.error && !/already|exists|registered/i.test(made.error.message)) return reply(500, { error: made.error.message });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) return reply(500, { error: link.error.message });
  return reply(200, { token_hash: link.data.properties.hashed_token, username });
});
