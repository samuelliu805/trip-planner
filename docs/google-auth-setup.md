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
     - `https://*-shus-projects-f7d1dcd0.vercel.app/**`
4. Leave **OAuth Server** disabled. It is for making Trip Planner an identity provider for other apps.
5. Under **Authentication → Sign In / Providers → Email**, keep email signup enabled and turn off
   **Confirm Email** while email verification is deferred. Supabase then implicitly confirms new
   email users and returns a session immediately, so signup can continue directly to `/trips`.

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

Custom SMTP can remain off while confirmation email is disabled. A production SMTP provider will
still be needed later for password recovery, magic links, and email verification when those flows are
enabled.

## Verification

1. Open `/login` and select **Continue with Google**.
2. Confirm that Google shows the Trip Planner consent screen and only basic identity scopes.
3. Complete login and confirm that `/auth/callback` redirects to `/trips`.
4. In Supabase **Authentication → Users**, confirm one user exists and its identities include Google.
5. Sign out, register a new email/password account, and confirm signup redirects directly to `/trips`
   without asking for email confirmation.
6. Sign out and repeat from `/signup`; the same Google account must return to the same user.
7. For a password account with the same email, Google login must add a Google identity to that
   existing user rather than create another user.
8. Sign out, select **Continue with Google** again, and confirm Google displays its account chooser.
