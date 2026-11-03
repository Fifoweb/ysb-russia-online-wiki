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

Image uploads use a separate `upload-evidence-image` handler with verified
Discord login, a streamed 10 MiB byte limit, raster signature/dimension checks,
independent request and byte quotas, bounded concurrency and a fixed hosting URL.
Only validated HTTPS Allwebs image URLs are returned; API credentials, deletion
links and provider response bodies are never exposed. Private SHA-256 caching
prevents duplicate hosting requests. Unknown delivery outcomes are not resent
automatically. Uploading images does not claim or reset report cooldowns.
Allwebs is temporary external storage; its reported expiration is displayed.
Bulk selections use `upload-evidence-album` with the same verified identity and
shared private quotas/cache. A request carries at most 20 MiB of image data
(21 MiB including multipart overhead), with one active album per worker. Files
are validated before reaching Fotora. Guest cookies exist only during that
server request; they are never stored, logged, or returned. The adapter uses
Fotora's normal guest form and stops if a captcha or an unexpected flow appears.
No external HTML or JavaScript is executed, and every remote URL is fixed or
validated against the exact provider host and album route. Switching providers
reuses the original cached proof URL instead of uploading the same photo again.
An album URL is reused only by its owner. A matching photo from another account
does not disclose the remaining photos in that account's album.
An owner also has to select every photo in a cached album before it can be
inserted automatically; selecting a subset cannot silently attach extra photos.

Employee account data is stored in `profiles` under the existing Supabase Auth
user ID associated with Discord login. Row level security allows each signed-in
user to read and edit only their own row. Game nickname and StaticID are
self-reported form defaults. Department membership is resolved separately by
`sync-profile-department` using the verified Auth Discord identity and the existing
server-side bot token. The guild comes from the configured application channel
(or an explicit server-side `DISCORD_GUILD_ID`). All eight owner-supplied membership
roles must exist in that guild; notification role IDs are not membership claims.
Clients cannot choose the Discord account, guild, or department for this lookup.
The membership table allows owner-only reads of the result, and no client writes,
RPC calls, lease reads, or global quota reads. Editable legacy `profiles.department`
values are ignored by the new client and never presented as verified membership.
No Discord provider token is required or retained. A single matched role confirms
the department; no role, a missing member, multiple departments, and outages are
distinct states. Unavailable or ambiguous results clear department autofill while
nickname and StaticID remain editable. Existing report permissions and department
routing do not change; select-based autofill uses each form's existing allowlist.
Results are cached for 60 seconds (15 on provider outages); 25-second leases prevent
parallel refreshes for the same account. At most 120 uncached checks start globally
per minute, and Discord 429 backoff pauses new checks for up to five minutes.
These membership results are form defaults, never additional authorization grants.
The browser caches profile data only in page memory and discards it on account changes. Personal
report drafts are reset on logout or switching accounts; manually edited fields
are not overwritten by a late profile response. The public achievements dashboard
continues to expose aggregate results only.

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

Vacation requests use the existing authenticated application limits and cooldown.
The caller's verified Discord identity is the only author that can be mentioned.
Leadership roles are a fixed server-side allowlist, including the owner-supplied
UDK and OVK leadership IDs. The webhook is stored only in
`DISCORD_VACATION_WEBHOOK_URL`; its webhook, guild and channel IDs are checked
before delivery. No client can create or update a vacation row. `reserve_vacation`
is service-only, serializes employee requests, rejects overlapping delivered
periods and acknowledges already-delivered request IDs without a second POST.
Known rejections can be retried; timeouts, transport errors and Discord 5xx keep
an uncertain reservation. Only database settlement is retried after delivery.
After verifying the Discord channel manually, an administrator can reconcile
`sending`/`uncertain` records to `delivered` (message present) or `failed`
(confirmed absent). The embed footer includes the request UUID for this check.
There is no automatic resend of an unknown delivery outcome.

The dashboard RPC is authenticated-only and returns names, departments and dates
for delivered current/upcoming vacations, capped at 500. Reasons and delivery
metadata are available only to each request owner through RLS. Time entry uses
Europe/Moscow (UTC+03:00), stored as timestamps with time zone. The list refreshes
every minute and never labels an undelivered request as an active vacation.

Run `npm run test:security`, `npm audit`, `npm run build` and `git diff --check`.
Apply database migrations before deploying the functions. Every submission
function must be redeployed when its shared guard changes. `discord-interactions`
is deployed separately with JWT verification disabled; it verifies Ed25519,
request age and a database-backed interaction ID before processing actions.

Only use offline/mock payloads and database tests inside rolled-back transactions
to test delivery paths. Do not send real applications or complaints to Discord.
