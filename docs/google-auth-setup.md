# Google authentication setup

Trip Planner uses Supabase Auth as the application identity provider and Google as a social login
provider. The Google client secret belongs in Supabase, not in the Next.js or Vercel environment.

## Google Auth Platform

Create a Web application OAuth client with these values:

- Authorized JavaScript origins:
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
   - Site URL: `https://trip-planner-ivory-one.vercel.app`
   - Redirect URLs:
     - `https://trip-planner-ivory-one.vercel.app/auth/callback`
     - `http://localhost:3000/**`
     - `https://*-<vercel-team-or-account-slug>.vercel.app/**`
4. Leave **OAuth Server** disabled. It is for making Trip Planner an identity provider for other apps.

The Vercel wildcard belongs only in Supabase. Google does not accept wildcards for OAuth redirect
URIs, and it does not need every Preview URL: Google always returns to the one fixed Supabase
callback URL. Trip Planner then asks Supabase to return to the origin that started the sign-in, which
allows the current Preview URL to receive the completed session.

Find `<vercel-team-or-account-slug>` at the end of a generated Preview URL. For example, a Preview
URL ending in `-acme.vercel.app` uses `acme` as the slug. Keep the production callback exact even
when the Preview wildcard is present.

Supabase automatically links a Google identity to an existing confirmed account with the same email.
An account created with Google can add password login later from an authenticated account-settings
flow; submitting the public signup form again does not add a password to that account.

## Verification

1. Open `/login` and select **Continue with Google**.
2. Confirm that Google shows the Trip Planner consent screen and only basic identity scopes.
3. Complete login and confirm that `/auth/callback` redirects to `/trips`.
4. In Supabase **Authentication → Users**, confirm one user exists and its identities include Google.
5. Sign out and repeat from `/signup`; the same Google account must return to the same user.
6. For a confirmed password account with the same email, Google login must add a Google identity to
   that existing user rather than create another user.
