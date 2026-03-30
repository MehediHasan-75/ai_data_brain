# Plan: Host Django Backend & Connect to Vercel Frontend

## Context

The frontend is already live on Vercel at https://ai-data-brain-frontend.vercel.app/. The Django backend runs only locally. This plan deploys the backend to Railway and connects it to the Vercel frontend.

**Chosen platform: Railway**
- One-click PostgreSQL addon
- Auto-detects Django/Python
- Handles heavy LLM dependencies (LangChain, MCP) without issues
- `DATABASE_URL` injection pattern matches existing production settings structure

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add `gunicorn`, `whitenoise`, `psycopg2-binary`, `dj-database-url` |
| `backend/expense_api/settings/base.py` | Add `whitenoise` middleware + Vercel URL to CORS/CSRF |
| `backend/expense_api/settings/production.py` | Replace individual DB fields with `dj_database_url.config(DATABASE_URL)` |
| `backend/Procfile` | New — gunicorn start command |
| `backend/railway.toml` | New — Railway build/deploy config |

Frontend:
| File | Change |
|------|--------|
| `frontend/.env.local` | Set `NEXT_PUBLIC_API_URL` for local dev |
| Any file hardcoding `localhost:8000` | Replace with `process.env.NEXT_PUBLIC_API_URL` |
| Vercel dashboard | Add `NEXT_PUBLIC_API_URL` env var pointing to Railway domain |

---

## Implementation Steps

### 1. `backend/requirements.txt` — add 4 packages

```
gunicorn>=21.0
whitenoise>=6.7
psycopg2-binary>=2.9
dj-database-url>=2.1
```

### 2. `backend/expense_api/settings/base.py` — whitenoise + CORS

Add `whitenoise` middleware directly after `SecurityMiddleware`:

```python
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # ← add
    ...
]

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
```

Update CORS and CSRF trusted origins:

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://ai-data-brain-frontend.vercel.app",
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "https://ai-data-brain-frontend.vercel.app",
]
```

### 3. `backend/expense_api/settings/production.py` — DATABASE_URL

Replace individual DB env vars with Railway's single `DATABASE_URL`:

```python
import dj_database_url

DATABASES = {
    'default': dj_database_url.config(default=env('DATABASE_URL'))
}
```

Remove the old individual `DB_ENGINE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` references.

### 4. `backend/Procfile` — new file

```
web: gunicorn expense_api.wsgi --workers 2 --timeout 120
```

120s timeout because LLM calls can be slow.

### 5. `backend/railway.toml` — new file

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "python manage.py migrate && gunicorn expense_api.wsgi --workers 2 --timeout 120"
healthcheckPath = "/"
restartPolicyType = "on_failure"
```

---

## Railway Setup (Manual Steps After Code Changes)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub → select repo
2. Set root directory to `backend/`
3. Add **PostgreSQL** plugin → Railway auto-injects `DATABASE_URL`
4. Set environment variables in Railway dashboard:
   ```
   DJANGO_SETTINGS_MODULE=expense_api.settings.production
   SECRET_KEY=<generate a strong random key>
   ALLOWED_HOSTS=<your-app>.up.railway.app
   ANTHROPIC_API_KEY=<your key>
   GOOGLE_API_KEY=<your key>
   DEBUG=False
   ```
5. Deploy → Railway runs `migrate` then starts `gunicorn`
6. Copy the generated Railway domain (e.g. `https://ai-data-brain-backend.up.railway.app`)

---

## Frontend Connection

The frontend uses `process.env.DJANGO_API_URL` (server-side BFF env var) defined in `frontend/src/lib/serverFetch.ts`.

1. In Vercel dashboard → Project Settings → Environment Variables, add:
   ```
   DJANGO_API_URL=https://<your-app>.up.railway.app
   ```
2. No code changes needed — the fallback in `serverFetch.ts` already handles this correctly.
3. Redeploy frontend on Vercel (or it will pick up on next deployment)

---

## Verification Checklist

- [ ] `GET https://<railway-domain>/` returns 200
- [ ] `POST https://<railway-domain>/auth/login/` authenticates correctly
- [ ] Frontend on Vercel can log in — cookies set, no CORS errors in browser console
- [ ] AI chat works end-to-end (LLM calls complete within timeout)
- [ ] Django admin accessible at `https://<railway-domain>/admin/`
