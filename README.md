# Professional Avatar Creator (MiniMax + Vercel)

Create 4 professional avatar styles from one uploaded photo:

- Corporate Studio
- Modern LinkedIn
- Minimal Resume
- Creative Professional

## Vercel Deploy (Recommended)

1. Push this project to GitHub.
2. In Vercel, click **Add New Project** and import the repo.
3. In Vercel Project Settings -> **Environment Variables**, add:
   - `MINIMAX_API_KEY` = your MiniMax key
   - `MINIMAX_API_BASE` = `https://api.minimax.io/v1` (or `https://api.minimaxi.com/v1`)
4. Deploy.
5. Open your Vercel URL.

## Required Files

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `api/generate.js`
- `vercel.json`

## How It Works

- Frontend calls `POST /api/generate`.
- Vercel serverless function (`api/generate.js`) forwards request to MiniMax.
- MiniMax key stays server-side in Vercel env vars.

## Local Test (Optional)

If you want to test static frontend quickly:

```bash
cd /Users/xiaomuwang/Documents/New\ project
ruby -run -e httpd . -p 3000
```

Open:

- `http://localhost:3000/public/`

Notes:
- Local static mode has no backend function, so browser may try direct MiniMax calls and can be blocked by CORS.
- Deployed Vercel mode is the intended production path.
