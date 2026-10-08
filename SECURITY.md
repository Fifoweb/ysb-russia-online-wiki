# Security controls

Applications require a verified Supabase login and a Discord provider identity.
Discord OAuth credentials are stripped from browser storage and are not used by
application functions. The browser holds only the site's own session credentials.

## Submission limits

All eleven submission functions use `withSubmissionCooldown`:

- Five authenticated attempts per user per 60-second window, including invalid
  forms, failed deliveries and requests blocked by the submission cooldown.
- 120 authenticated attempts across the site per 60-second window. A user blocked
  by their individual limit cannot exhaust the shared bucket.
- One successful submission per user every 150 seconds across all forms.
- JSON objects only, with a 16 KiB byte limit enforced while reading the stream.
- Database errors fail closed. Logs contain fixed event names and HTTP status
  codes, never request bodies, raw network errors, bot tokens or webhook URLs.

Anonymous calls return 401 before creating database buckets. These limits bound
authenticated processing; they cannot prevent network-level floods or the cost
of every incoming Edge Function invocation. Provider gateway protection and an
external WAF are separate controls.

## Sessions and private data

`is_site_session_active()` checks the caller's verified JWT session ID against
`auth.sessions`: the session must belong to the caller, still exist, be less than
eight hours old and have been refreshed within 30 minutes. It also respects
`not_after`. The check protects both submission functions and RLS policies on
profiles, bookmarks and favorites. It returns only a boolean for the caller.

Production JWT expiration is 900 seconds so normal automatic refresh fits within
the inactivity window. Browser UI inactivity still signs out after 30 minutes.
Server inactivity measures token refresh, not keyboard or pointer activity. These
application access checks do not replace Supabase's paid Auth session settings or
revoke all Auth refresh credentials. The eight-hour access limit remains enforced
even if a token is continuously refreshed.

Production Discord login uses the site's exact GitHub Pages redirect URL. Email
login is disabled. After these settings change, existing sessions may need a new
Discord login; no Discord role, mention or routing configuration changes.

## Monitoring

The private request bucket table exposes no API access to anon/authenticated.
Use the Supabase SQL editor as an administrator to inspect the current window:

```sql
select
  coalesce(max(attempts) filter (where bucket = 'global'), 0) as global_attempts,
  coalesce(max(blocked) filter (where bucket = 'global'), 0) as global_blocked,
  coalesce(sum(blocked) filter (where bucket <> 'global'), 0) as user_blocked
from public.application_request_limits
where window_started_at > now() - interval '60 seconds';
```

Counters reset at the start of the next window. Inspect Supabase Edge Function
request/error charts for history and fixed failure events in function logs. Never
export raw authorization headers, session payloads or function secret values.

## GitHub Pages limitation

The deployed HTML has a restrictive meta CSP, an exact Supabase origin allow-list
and a JavaScript frame guard. GitHub Pages cannot serve this project's custom
security response headers. A `_headers` file or a meta `frame-ancestors` directive
would not fix that limitation.

Full framing protection needs a controlled hosting origin or a custom domain
behind a proxy that sends `Content-Security-Policy: frame-ancestors 'none'`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and the appropriate
Referrer-Policy. Keep the full existing CSP when moving it to response headers.
Do not move the site or change its public URL without a deployment plan that also
updates OAuth redirects and verifies all GitHub Pages routes.

## Verification and deployment

Run `npm run test:security`, `npm audit`, `npm run build` and `git diff --check`.
Apply database migrations before deploying the functions. Every submission
function must be redeployed when its shared guard changes. `discord-interactions`
is deployed separately with JWT verification disabled; it verifies Ed25519,
request age and a database-backed interaction ID before processing actions.

Only use offline/mock payloads and database tests inside rolled-back transactions
to test delivery paths. Do not send real applications or complaints to Discord.
