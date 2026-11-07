# Existing school registration policy

`POST /auth/signup` already provided public school registration and a three-day
trial. The updated `/signup` form preserves that policy. It never activates a
paid plan, links an existing user's account, issues login tokens, or grants
super-admin access. Users sign in through the existing login flow afterwards.
Email verification is not implemented and no email is marked verified.

Only a trusted deployment administrator should change the backend environment:

- `PUBLIC_SCHOOL_SIGNUP_ENABLED=true` enables the existing public trial flow.
- `PUBLIC_SCHOOL_SIGNUP_ENABLED=false` disables new school registrations while
  leaving existing accounts and login unchanged.
- The unset default remains `true` for compatibility with the existing app.
  Set it explicitly in production to record the intended policy.
- `REDIS_URL` must point to a private, reachable Redis instance. Signup limits
  each resolved client IP to five attempts per fifteen minutes using one atomic
  Redis operation shared by all API workers. Redis failure blocks signup with
  503; there is no in-memory or fail-open fallback. Keys contain only hashed IPs.
- Configure Uvicorn's trusted proxy/forwarded-IP settings for the actual hosting
  proxy. Arbitrary forwarded headers are not trusted by the application; do not
  expose the origin with blanket trust of client-provided proxy headers.

`GET /auth/signup-policy` exposes only public availability, trial length, and
password requirements so the frontend can show disabled/error states safely.
Eight to 128 password characters are required, with no leading/trailing spaces,
consistent with the existing eight-character hashing minimum. New forms submit
`confirm_password`; it is optional only for compatibility with older clients.
Unknown fields, including organization IDs, roles, plans, and super-admin flags,
are rejected. Validation responses omit submitted input and credentials.

The Organization model currently has no email, phone, or address columns. Those
unsupported optional fields are omitted instead of collecting unsaved data.
School names are not unique in the current schema; registration preserves that
rule. Existing administrator emails cannot be reused, including case variants.
The unique email constraint and an email-scoped PostgreSQL transaction lock
protect concurrent registrations. Grade seeding, user, organization and admin
membership creation now commit together or roll back together.

No migration is required. Deploy the backend changes before the new frontend:
older backends lack `/auth/signup-policy`, and the form deliberately stays
disabled when it cannot check availability. No deployment is performed by this
change.
