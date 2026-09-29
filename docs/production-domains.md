# ThereWeGo domain rollout

Final topology:

| Host                  | Application                                          | Identity, data and storage |
| --------------------- | ---------------------------------------------------- | -------------------------- |
| `therewego.world`     | Global, Vercel                                       | Supabase                   |
| `www.therewego.world` | HTTP 308 to `therewego.world`, preserving path/query | Same Global application    |
| `cn.therewego.world`  | CN, CloudBase Run in Shanghai                        | CloudBase                  |

Global and CN accounts and trips remain independent. A shared parent domain must not introduce
parent-domain session cookies or a shared authentication backend.

Global Preview and Production intentionally share the existing Supabase backend, database, auth
and storage. Keep their Supabase project references and credentials as configured. A Preview URL
does not imply an isolated data plane, so use controlled test accounts and preserve cleanup guards.
The domain rollout does not create a Supabase branch or project.

For console-by-console instructions in Chinese, see
[the detailed setup steps](./domain-setup-steps.zh-CN.md).

## Verified state on 2026-09-29

- DNS is delegated to DNSPod (`henry.dnspod.net`, `peach.dnspod.net`). The apex A and `www` CNAME
  now resolve, HTTPS works, and `www` redirects to the apex. The `cn` record is still absent.
  Cloudflare is currently used for Turnstile, not authoritative DNS.
- Vercel project `trip-planner`, `prj_51kZNlaZEWGpQo6a1Gn0p9jr9wbd`, already verifies both Global
  domains and has the correct `www` HTTP 308 redirect.
- Supabase project `ewyefmnadibnampbeyzc` allows both Global domain redirect patterns. Google login,
  email verification, Resend SMTP and Turnstile are enabled. The recovery template uses
  `.RedirectTo` and `.TokenHash`, preserving the mail-scanner confirmation boundary.
- The working Global Site URL remains `https://trip-planner-ivory-one.vercel.app` until DNS/TLS
  and hostname restrictions are verified. Its current deployment stays available during rollout.
- Only CN environment `trip-planner-cn-dev-d3bz94038b26` exists in Shanghai. Its PG instance is
  `pgdb-l4lhtrv7`; it is also the fixed live-test target. No separate CN production environment,
  custom domain or certificate was verified.
- The current Tencent management credential cannot read or change DNSPod records and cannot read
  SSL certificates. Google Cloud and Cloudflare management sessions are unavailable.

## 1. Prepare Google and Cloudflare before enabling website DNS

In Google Cloud, select the existing Web OAuth client:
`106808837886-gvi8ga2n0iuqt3h9hq7s03slnfr3mc1f.apps.googleusercontent.com`.

1. In **Google Auth Platform > Clients**, add JavaScript origins `https://therewego.world` and
   `https://www.therewego.world`. Retain the current Vercel/local development origins.
2. Keep the redirect URI exactly
   `https://ewyefmnadibnampbeyzc.supabase.co/auth/v1/callback`. The app domain change does not
   change this Google-to-Supabase callback.
3. In **Branding**, use `https://therewego.world` as homepage, `/privacy` as privacy-policy URL
   and `/terms` as terms URL. Add `therewego.world` to authorized domains and complete domain
   ownership verification if Google requests it. Confirm the intended public audience is enabled.
4. In **Google Maps Platform > Credentials**, add `https://therewego.world/*` and
   `https://www.therewego.world/*` to the existing production browser key's website restrictions.
   Keep preview/browser and server keys separate; server Places/Routes keys retain their existing
   API restrictions and are not exposed to the browser.

In **Cloudflare > Turnstile**, edit the existing widget with public site key
`0x4AAAAAAE1X6kJBdpA36hjd`. Allow `therewego.world` and `www.therewego.world`; retain the current
Vercel hostname. Do not rotate the keys or move the Turnstile secret out of Supabase.
Cloudflare hostname entries use hostnames without `https://` or paths.

Google Drive does not manage Google Cloud OAuth clients, Maps keys or DNS; no Drive permission or
file change is needed for this rollout.

## 2. Verify Global DNS in DNSPod

The Vercel domain-configuration API returned these preferred values on 2026-09-29. Recheck the
project's **Settings > Domains** before entering them if the rollout happens later.

| Type  | Name  | Value                                 | Line    |
| ----- | ----- | ------------------------------------- | ------- |
| A     | `@`   | `216.198.79.1`                        | Default |
| CNAME | `www` | `443c5344fc5d2083.vercel-dns-017.com` | Default |

The working records above are already present; leave them in place. Vercel also accepts
`64.29.17.1` at rank 1, but adding another A record is unnecessary while the domain is healthy.
Keep all mail records, including the `mail.therewego.world` SPF/DKIM/MX and existing DMARC.
Do not pause the zone, replace nameservers, add a conflicting `AAAA`, or add a URL-forwarding record.
Wait until Vercel shows both domains correctly configured and their TLS certificates ready.

## 3. Activate the Global origin after DNS/TLS are ready

1. In Vercel **trip-planner > Settings > Environment Variables > Production**, set
   `NEXT_PUBLIC_SITE_URL=https://therewego.world`. Preserve Preview's existing value.
   Keep the existing shared Supabase URL and keys for both Production and Preview.
2. In GitHub **Settings > Environments > global-production > Variables**, set the same
   `NEXT_PUBLIC_SITE_URL`. This keeps deployment verification synchronized with the application.
3. In Supabase **Authentication > URL Configuration**, set Site URL to `https://therewego.world`.
   Both new domain redirect patterns are already allowlisted; retain the working Vercel and
   development callbacks through the transition. Keep Google, SMTP, confirmation and captcha settings.
4. Redeploy the reviewed exact Global SHA and require the normal deployment/log gates to pass.
5. Set server-only `GLOBAL_SITE_URL=https://therewego.world` in the CN Run service after the new
   Global site works. This switches its footer's Global link. The unset value keeps the working
   Vercel fallback; the setting is read at request time in the server-rendered landing page.
6. Verify `/`, `/login`, `/signup`, `/forgot-password`, `/privacy`, `/terms` and `/support`; test
   Google login, verified email signup/recovery, Maps/Places and existing share links. Check that
   `https://www.therewego.world/login?next=%2Ftrips` redirects to the same path/query on the apex.

## 4. Prepare the CN environment and bind its domain

The existing environment can be reused as production; its name is not a technical restriction.
Before admitting production users, move the controlled live tests to a different environment and
PG/storage plane. Test cleanup must never target the production backend. The repository's current
production workflow also explicitly rejects the current dev EnvId/PG instance. Changing that
deployment target and the pinned test target requires a reviewed migration of the configuration;
do not remove the assertions, skip live suites or merely rename the GitHub environment.

1. Choose the existing environment's future role and a distinct test environment. Preserve existing
   data when reusing the former for production. Populate the test environment with the approved
   schema, migrations, controlled accounts and private storage setup.
2. Update the exact test-target guards and GitHub dev credentials through a PR; require fresh Global
   and CN live verification, cleanup and zero residue. Configure the production target, alert/restore
   evidence, SMS readiness and known-good rollback version described in
   [the rollout runbook](./phase-6-rollout-runbook.md).
3. In Tencent Cloud **SSL Certificates**, obtain a valid certificate for `cn.therewego.world` and
   note its certificate ID. A Cloudflare Origin CA certificate is unsuitable for direct browser TLS.
4. In the chosen CloudBase environment **HTTP Gateway > Custom domains**, add `cn.therewego.world`
   with that certificate. Confirm the plan supports binding and the ICP filing is recognized.
5. Add a route for this domain: CN Run service, path `/`, path pass-through enabled. This Next.js
   application serves its own public/auth routes and enforces application authentication; preserve
   that behavior rather than adding a gateway login requirement to every page.
6. Add `cn.therewego.world` to CloudBase authentication/storage safe domains and to the AMap browser
   key's domain restrictions. Preserve server-key separation and the AMap JS security code.
7. Add `CNAME cn` in DNSPod using the exact **CNAME returned by the custom-domain binding**. Do not
   infer it from the old Run hostname.
8. Set the CN runtime and production GitHub `NEXT_PUBLIC_SITE_URL=https://cn.therewego.world`.
   Deploy the reviewed SHA and verify health, logs, phone-login presentation, Maps, private storage
   and public sharing. A real SMS verification needs the user's chosen test number and quota consent.
9. After the CN domain works, set server-only `CN_SITE_URL=https://cn.therewego.world` in Vercel
   Production and redeploy. This switches the Global footer to the new CN site. Until then it retains
   the working CN Run link.

## 5. Complete the registration display

The CN and Global homepage footers display `沪ICP备2026049500号` linked to
`https://beian.miit.gov.cn/` in subdued small text. The Global `www` domain redirects to that same
Global homepage. Both regional homepage titles and inherited page-title suffixes contain the
registered site name `ThereWeGo行至`; the visible English wordmark stays `There we go`.
Confirm the exact website number in the filing console, including any website suffix, and adjust
the display if the issued website number differs from the supplied number.

Use the privately supplied public-security data code in
[the public-security filing portal](https://beian.mps.gov.cn/), following
[Tencent's data-code guide](https://cloud.tencent.com/document/product/243/120137).
The code imports application information; it is not the issued public-security registration number
and must not appear in source, frontend metadata, screenshots or this runbook.

The data code is valid for 30 days; website public-security filing is due within 30 days after
service opening. After approval, add the issued `沪公网安备…号`, official icon and portal-provided
query link to the shared homepage footer. Do not construct a registration number from the data code.

No application database migration is needed for the domain/ICP-footer change itself.
