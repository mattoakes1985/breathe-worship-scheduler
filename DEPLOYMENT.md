# Deployment Runbook — Breathe Worship Scheduler (PRD §14)

## Environments

| Env | Supabase project | Hosting |
|---|---|---|
| Production | `breathe-worship-scheduler` (`mlwkyhlzggqkkioxucxj`, eu-west-2 London, free tier) | Vercel (recommended) or Netlify |
| Staging | Create a second free-tier project when needed | Vercel preview deployments |

## First deploy (Vercel)

1. Push this repo to GitHub (`mattoakes1985/...`).
2. In Vercel: New Project → import the repo → framework preset **Vite**.
3. Environment variables (Production):
   - `VITE_SUPABASE_URL=https://mlwkyhlzggqkkioxucxj.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=sb_publishable_0qsC9UF1Q4YK6uwwpdGjZA_76n1Mh4l`
4. Add a rewrite so client routing works — create `vercel.json`:
   `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` (already committed).
5. Deploy. Production deploys are a **manual promotion** — keep auto-deploy on a `staging` branch and promote to `main` deliberately (PRD §14).

## Supabase configuration (one-time, dashboard)

- **Auth → Providers → Email**: disable "Allow new users to sign up" (invite-only, AUTH-1).
  Invites are sent from the app via the `invite-volunteer` Edge Function.
- **Auth → Email templates**: reset-link expiry defaults satisfy AUTH-3.
- **Auth → URL configuration**: set the site URL to the production domain.
- **Edge Functions**: deploy `invite-volunteer` (`supabase functions deploy invite-volunteer`).
  It uses the built-in `SUPABASE_SERVICE_ROLE_KEY` — no extra secret needed.
- **SMTP/Resend** (optional, for branded email): Auth → SMTP settings, or set
  `RESEND_API_KEY` as a function secret if/when an email fan-out function is added.

## Rollback

- Frontend: Vercel → Deployments → "Promote" the previous deployment (instant).
- Database: Supabase automatic backups (daily on free tier). Restore via Dashboard →
  Database → Backups. Migrations are forward-only files in `supabase/migrations/`;
  never edit an applied migration — add a new one.

## Key rotation

- Supabase service key: Dashboard → Settings → API → rotate. Then redeploy Edge Functions.
- Publishable key: rotate in the same place; update Vercel env + `.env.local`.

## Access (single-point-of-failure risk, PRD §15)

Matt holds Supabase/hosting/domain access. Add a second trusted admin to each service.
