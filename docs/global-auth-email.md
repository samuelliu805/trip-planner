# Global authentication email configuration

The Global deployment uses Supabase Auth, Resend SMTP, and Cloudflare Turnstile. Keep these
provider settings synchronized with the application before accepting a release.

## Recovery template

Supabase recovery links are single-use. The hosted Recovery template must send users to the
application confirmation page so that mail scanners can perform a harmless `GET`; Supabase only
consumes the token after the user presses the confirmation button.

In **Supabase > Authentication > Email Templates > Reset Password**, preserve the approved email
copy and set the reset button's `href` to exactly:

```html
{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery
```

Do not use `{{ .ConfirmationURL }}` for the reset button. The application supplies an allowlisted,
deployment-specific `.RedirectTo` ending in `/auth/verify?auth_flow=recovery&auth_method=email_link`.

In Resend, keep click tracking disabled for the Supabase SMTP stream. Tracking is not required for
authentication mail and can rewrite one-time authentication URLs.

## Release verification

1. Confirm signup requires email verification and an unconfirmed account cannot sign in.
2. Open the newest confirmation email and confirm it reaches `/trips?post_login=1`.
3. Request password recovery after completing Turnstile.
4. Open the newest recovery email. It must show `/auth/verify` without immediately consuming the
   recovery token.
5. Press **Continue to reset password**, choose a new password, and confirm the old password fails
   while the new password succeeds.
6. Confirm no raw email address, token, or password appears in application telemetry or CI output.

Old recovery emails generated before a template change remain single-use and must not be used as
release evidence.
