# PyLearn Deployment Guide

This guide deploys the PyLearn backend to Railway and the Next.js frontend to Vercel.

The production request flow is:

```text
Browser -> Vercel Next.js app -> /backend-api/* rewrite -> Railway Django /api/v1/*
Browser -> Vercel Next.js app -> /media/* rewrite -> Railway Django /media/* for local development only
```

For production uploads, do not rely on Railway's app filesystem. Use Railway Storage Bucket / S3-compatible storage or Vercel Blob through the Django storage settings.

## Repository Layout

```text
.
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── pylearn/settings.py
│   └── portal/
├── src/
├── public/
├── next.config.ts
├── package.json
└── DEPLOYMENT.md
```

## Required Production URLs

Replace these placeholders as you deploy:

```text
BACKEND_URL=https://your-railway-backend.up.railway.app
FRONTEND_URL=https://your-vercel-frontend.vercel.app
```

Use the final custom domains instead if you attach custom domains.

## Preflight

1. Push this repository to GitHub.
2. Keep real secrets out of Git. Use Railway and Vercel environment variables.
3. Rotate any secret that was ever committed, pasted into logs, or shared in chat. Removing a value from the current tree does not remove it from Git history or external logs.
4. The backend includes `gunicorn` and `backend/Procfile` for Railway's production web process.
5. If you need styled Django admin pages in production, add and configure WhiteNoise or another static file serving solution. The current frontend works without Django admin static files, but `/django-admin/` styling depends on static file serving when `DJANGO_DEBUG=false`.

## Backend: Railway

### 1. Create Railway Project

1. Open Railway.
2. Create a new project.
3. Choose deployment from GitHub.
4. Select this repository.
5. Create the backend service from the repository.
6. Set the service root directory to:

```text
backend
```

### 2. Add PostgreSQL

1. In the same Railway project, add a PostgreSQL database service.
2. Open the backend service variables.
3. Add a Django database URL that points to the Railway PostgreSQL service.

If Railway exposes a `DATABASE_URL` variable from the PostgreSQL service, set:

```text
DJANGO_DATABASE_URL=${{Postgres.DATABASE_URL}}
```

If the Railway variable is named differently in your project, use the equivalent PostgreSQL connection URL.

Do not set `USE_SQLITE=true` in production.

### 3. Backend Environment Variables

Set these on the Railway backend service:

```text
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app
DJANGO_DATABASE_URL=${{Postgres.DATABASE_URL}}
DJANGO_TIME_ZONE=Asia/Dhaka
FRONTEND_URL=https://your-vercel-frontend.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-vercel-frontend.vercel.app
AI_CONFIG_ENCRYPTION_KEY=replace-with-a-fernet-key
MAX_UPLOAD_SIZE=104857600
AVATAR_MAX_UPLOAD_SIZE=5242880
COURSE_THUMBNAIL_MAX_UPLOAD_SIZE=8388608
```

If you use a custom backend domain, include it in `DJANGO_ALLOWED_HOSTS`:

```text
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.yourdomain.com
```

If you use Vercel preview deployments, add trusted preview origins too:

```text
CSRF_TRUSTED_ORIGINS=https://your-vercel-frontend.vercel.app,https://*.vercel.app
```

Use exact origins where possible.

### 4. Production Media Storage

Choose one option.

#### Option A: Railway Storage Bucket / S3-Compatible Storage

Set:

```text
MEDIA_STORAGE_BACKEND=s3
MEDIA_STORAGE_BUCKET_NAME=${{Bucket.BUCKET}}
MEDIA_STORAGE_ACCESS_KEY_ID=${{Bucket.ACCESS_KEY_ID}}
MEDIA_STORAGE_SECRET_ACCESS_KEY=${{Bucket.SECRET_ACCESS_KEY}}
MEDIA_STORAGE_REGION=${{Bucket.REGION}}
MEDIA_STORAGE_ENDPOINT_URL=${{Bucket.ENDPOINT}}
MEDIA_STORAGE_ADDRESSING_STYLE=virtual
MEDIA_STORAGE_LOCATION=media
```

If Railway injects the bucket variables directly into the backend service as `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, and `ENDPOINT`, the app can read those names without the `MEDIA_STORAGE_*` aliases.

#### Option B: Vercel Blob Through Django

Set:

```text
MEDIA_STORAGE_BACKEND=vercel_blob
BLOB_STORE_ID=store_xxxxxxxxxxxxx
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxx
MEDIA_STORAGE_ACCESS=public
```

Use this only if you intentionally want Django to write uploaded files to Vercel Blob.

### 5. Optional Email Variables

If password reset email should send real messages, set:

```text
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-smtp-user
EMAIL_HOST_PASSWORD=your-smtp-password
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
DEFAULT_FROM_EMAIL=PyLearn <noreply@yourdomain.com>
```

If these are not set, Django writes emails to the console.

### 6. Railway Build and Start Commands

In the Railway backend service settings, use:

```bash
pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
```

Start command:

```bash
gunicorn pylearn.wsgi:application --bind 0.0.0.0:$PORT
```

This command is also committed in `backend/Procfile`:

```text
web: gunicorn pylearn.wsgi:application --bind 0.0.0.0:$PORT
```

If Railway separates install/build/start automatically, keep the same commands in the matching fields. The important parts are:

```bash
pip install -r requirements.txt
python manage.py migrate
gunicorn pylearn.wsgi:application --bind 0.0.0.0:$PORT
```

### 7. Create Admin User

After the first successful backend deploy, open a Railway shell or one-off command for the backend service.

Set:

```text
DJANGO_SUPERUSER_EMAIL=admin@yourdomain.com
DJANGO_SUPERUSER_PASSWORD=replace-with-a-strong-password
```

Run:

```bash
python createsuperuser.py
```

Admin URL:

```text
https://your-railway-backend.up.railway.app/django-admin/
```

### 8. Optional Demo Data

To load the demo dataset:

```bash
python manage.py seed_demo
```

This command is designed to add or refresh demo data without deleting the database.

### 9. Backend Smoke Test

Open these URLs after deployment:

```text
https://your-railway-backend.up.railway.app/
https://your-railway-backend.up.railway.app/api/v1/auth/csrf/
https://your-railway-backend.up.railway.app/django-admin/
```

Expected:

1. `/` redirects to `/django-admin/`.
2. `/api/v1/auth/csrf/` returns a CSRF response and sets a CSRF cookie.
3. `/django-admin/` loads the admin login page.

## Frontend: Vercel

### 1. Create Vercel Project

1. Open Vercel.
2. Import the same GitHub repository.
3. Select Next.js as the framework.
4. Keep the project root as the repository root:

```text
.
```

### 2. Vercel Build Settings

Use the default Next.js settings or set them explicitly:

```text
Install Command: npm ci
Build Command: npm run build
Output Directory: .next
```

Do not set the Vercel root directory to `backend`; Vercel deploys the frontend from the repository root.

### 3. Frontend Environment Variables

Set these on the Vercel project:

```text
DJANGO_BACKEND_URL=https://your-railway-backend.up.railway.app
NEXT_PUBLIC_LOGO_LIGHT=pylearn-logo-dark.svg
NEXT_PUBLIC_LOGO_DARK=pylearn-logo-light.svg
NEXT_PUBLIC_FAVICON_LIGHT=pylearn-favicon-light.svg
NEXT_PUBLIC_FAVICON_DARK=pylearn-favicon-dark.svg
```

`DJANGO_BACKEND_URL` is used by `next.config.ts` for rewrites:

```text
/backend-api/* -> https://your-railway-backend.up.railway.app/api/v1/*
/media/*       -> https://your-railway-backend.up.railway.app/media/*
```

The browser should call `/backend-api/...`, not the Railway URL directly.

### 4. Deploy Frontend

Deploy the Vercel project.

After Vercel gives you the production URL, go back to Railway and update:

```text
FRONTEND_URL=https://your-vercel-frontend.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-vercel-frontend.vercel.app
```

Redeploy the Railway backend after changing those variables.

### 5. Frontend Smoke Test

Open:

```text
https://your-vercel-frontend.vercel.app
```

Check:

1. Login/register pages load.
2. Browser network requests go to `/backend-api/...` on the Vercel domain.
3. `/backend-api/auth/csrf/` returns successfully.
4. Login works with the admin user or a registered user.
5. Course thumbnails, avatars, and material downloads work after upload.

## Final Production Checklist

Backend:

```text
DJANGO_DEBUG=false
DJANGO_SECRET_KEY is unique and private
DJANGO_DATABASE_URL points to Railway PostgreSQL
DJANGO_ALLOWED_HOSTS contains the Railway backend host and custom backend domain
CSRF_TRUSTED_ORIGINS contains the Vercel frontend origin
FRONTEND_URL is the Vercel frontend origin
MEDIA_STORAGE_BACKEND is s3 or vercel_blob
AI_CONFIG_ENCRYPTION_KEY is set
gunicorn is installed
migrations have run
admin user exists
```

Frontend:

```text
DJANGO_BACKEND_URL points to the Railway backend origin
NEXT_PUBLIC_* branding variables are set or defaults are acceptable
npm run build passes
login flow works through /backend-api
uploads display after page refresh
```

## Common Fixes

### 400 Bad Request from Backend

Cause: `DJANGO_ALLOWED_HOSTS` does not include the Railway/custom backend host.

Fix:

```text
DJANGO_ALLOWED_HOSTS=your-railway-backend.up.railway.app,api.yourdomain.com
```

### 403 CSRF Failed on Login or POST Requests

Cause: Vercel frontend origin is missing from `CSRF_TRUSTED_ORIGINS`.

Fix:

```text
CSRF_TRUSTED_ORIGINS=https://your-vercel-frontend.vercel.app
```

Then redeploy the Railway backend.

### Frontend Calls Localhost in Production

Cause: `DJANGO_BACKEND_URL` is missing in Vercel.

Fix:

```text
DJANGO_BACKEND_URL=https://your-railway-backend.up.railway.app
```

Then redeploy the Vercel frontend. Environment variable changes apply to new deployments.

### Uploads Disappear After Deploy

Cause: local `backend/media/` is ephemeral on Railway and is not served in production with `DJANGO_DEBUG=false`.

Fix: use:

```text
MEDIA_STORAGE_BACKEND=s3
```

or:

```text
MEDIA_STORAGE_BACKEND=vercel_blob
```

### Django Admin Has No Styling

Cause: production static files are not being served.

Fix: configure WhiteNoise or another static file server for Django static assets. Keep `python manage.py collectstatic --noinput` in the build command.

### Database Tables Missing

Cause: migrations did not run against the Railway PostgreSQL database.

Fix:

```bash
python manage.py migrate
```

## Local Verification Before Deploy

Backend:

```powershell
cd backend
$env:USE_SQLITE="true"
python manage.py test
python manage.py migrate
python manage.py runserver 8000
```

Frontend:

```powershell
npm ci
npm run lint
npm run typecheck
npm run build
npm run dev
```

Open:

```text
http://localhost:3000
```

## References

- Railway Django guide: https://docs.railway.com/guides/django
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel rewrites: https://vercel.com/docs/routing/rewrites
- Vercel Next.js deployments: https://vercel.com/docs/frameworks/full-stack/nextjs
