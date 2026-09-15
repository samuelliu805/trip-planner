# Google authentication setup

Trip Planner uses Supabase Auth as the application identity provider and Google as a social login
provider. The Google client secret belongs in Supabase, not in the Next.js or Vercel environment.

## Google Auth Platform

Create a Web application OAuth client with these values:

- Authorized JavaScript origins:
  - `https://therewego.world`
  - `https://trip-planner-ivory-one.vercel.app`
  - `http://localhost:3000`
- Authorized redirect URI:
  - Use the exact callback URL shown in Supabase under **Authentication → Sign In / Providers → Google**.
  - It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.

Only request the `openid`, `email`, and `profile` scopes for sign-in.

## Supabase

1. Open **Authentication → Sign In / Providers → Google**.
2. Paste the Google Web Client ID and Client Secret, enable the provider, and save.
3. Under **Authentication → URL Configuration**, set:
   - Site URL: `https://therewego.world`
   - Redirect URLs:
     - `https://therewego.world/**`
     - `https://trip-planner-ivory-one.vercel.app/auth/callback`
     - `http://localhost:3000/**`
     - `https://*-shus-projects-f7d1dcd0.vercel.app/**`
4. Leave **OAuth Server** disabled. It is for making Trip Planner an identity provider for other apps.
5. Under **Authentication → Sign In / Providers → Email**, keep email signup and **Confirm Email**
   enabled. Keep unverified email sign-ins disabled. Email/password signup must return no session;
   the user confirms the emailed link before Supabase will accept a password login.
6. Configure custom SMTP with Resend using `smtp.resend.com`, port `465`, username `resend`, a
   Resend API key as the password, and a sender on the verified `mail.therewego.world` domain. Never
   put the API key in Vercel or this repository.
7. Under **Authentication → Bot and Abuse Protection**, enable Cloudflare Turnstile with the widget
   secret. The widget must allow the production hostname. Keep the secret only in Supabase.

The matching public Turnstile site key is required as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the
Vercel Production environment and as a `global-production` GitHub environment variable. Preview or
local automated tests may use Cloudflare's documented test keys only while the backing Supabase
project is configured with the matching test secret; never mix a test site key with a production
secret.

The Vercel wildcard belongs only in Supabase. Google does not accept wildcards for OAuth redirect
URIs, and it does not need every Preview URL: Google always returns to the one fixed Supabase
callback URL. Trip Planner then asks Supabase to return to the origin that started the sign-in, which
allows the current Preview URL to receive the completed session.

The Preview wildcard uses the current Vercel account slug from Trip Planner deployment URLs. Keep
the production callback exact even when the Preview wildcard is present.

Supabase automatically links a Google identity to an existing confirmed account with the same email.
An account created with Google can add password login later from an authenticated account-settings
flow; submitting the public signup form again does not add a password to that account.

Google OAuth sends `prompt=select_account`, so every new login lets the user choose among their active
Google accounts. Switching accounts is: log out of Trip Planner, select **Continue with Google**, then
choose another account. Different Google email addresses remain different Trip Planner users;
identical verified email addresses are linked automatically.

Email confirmation and password recovery share the Resend SMTP configuration. The recovery email
returns through `/auth/callback?auth_flow=recovery`, establishes the bounded recovery session, and
then opens `/reset-password`.

## Verification

1. Open `/login` and select **Continue with Google**.
2. Confirm that Google shows the Trip Planner consent screen and only basic identity scopes.
3. Complete login and confirm that `/auth/callback` redirects to `/trips`.
4. In Supabase **Authentication → Users**, confirm one user exists and its identities include Google.
5. Register a new email/password account and confirm signup asks the user to check their inbox and
   does not create a browser session.
6. Confirm password login is rejected before email verification, then follow the confirmation link
   and verify the account can sign in.
7. From `/forgot-password`, request a recovery email, follow the link, set a new password, and verify
   the recovery session is signed out after completion.
8. Sign out and repeat from `/signup`; the same Google account must return to the same user.
9. For a password account with the same email, Google login must add a Google identity to that
   existing user rather than create another user.
10. Sign out, select **Continue with Google** again, and confirm Google displays its account chooser.
