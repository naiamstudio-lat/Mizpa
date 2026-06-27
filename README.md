# Mizpa

AI agent that audits websites, generates optimized React+Tailwind replicas, and deploys them to Cloudflare Pages.

## Stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS
- **Backend**: Supabase (Auth, Postgres, Edge Functions)
- **VMs**: freestyle.sh (snapshots for instant provisioning)
- **Deploy**: Cloudflare Pages

## Skills

| Skill | Description |
|-------|-------------|
| `audit` | SEO + GEO analysis with scores and issues |
| `generate` | Fetches a site, generates a React+Tailwind replica, deploys to Cloudflare |
| `replica` | Same as generate (alias) |

## Dev

```bash
npm install
cp .env.example .env
npm run dev
```

## Deploy

```bash
npx supabase functions deploy create-task --project-ref <ref>
npx supabase functions deploy task-callback --project-ref <ref>
```

## Environment

Supabase secrets (set via `npx supabase secrets set`):

- `FREESTYLE_API_KEY` — freestyle.sh API key
- `FREESTYLE_SNAPSHOT_ID` — pre-built VM snapshot
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token

## License

Proprietary software by [Naiam Studio](https://naiamstudio.com). Exclusive use for Mizpa.
