# Professional Avatar Creator (MiniMax AI Version)

A local web app that lets you upload one photo and generate 4 true AI professional avatar styles:

- Corporate Studio
- Modern LinkedIn
- Minimal Resume
- Creative Professional

## Features

- Drag-and-drop image upload (PNG/JPG/WEBP, up to 12 MB)
- One-click AI generation of 4 avatar styles via MiniMax image generation
- 1024x1024 outputs
- Download each style as PNG
- MiniMax API key input in UI (saved in your browser localStorage)
- API region selector (`api.minimaxi.com` or `api.minimax.io`)

## Replit Deploy (Recommended)

1. Create a new **Node.js** Repl.
2. Upload these files/folders to Replit root:
   - `server.js`
   - `package.json`
   - `.replit`
   - `public/`
3. In Replit, open **Secrets** and add:
   - `MINIMAX_API_KEY` = your MiniMax key
   - `MINIMAX_API_BASE` = `https://api.minimax.io/v1` (or `https://api.minimaxi.com/v1`)
4. Click **Run**.
5. Open the Replit app URL and use the uploader.

## Local Run

1. Start a local web server (recommended):

```bash
cd /Users/xiaomuwang/Documents/New\ project
ruby -run -e httpd . -p 3000
```

2. Open `http://localhost:3000/public/` in your browser.
3. Paste your MiniMax API key in the `MiniMax API Key` field.
4. Choose API region that matches your key.
5. Optional but recommended: provide a public image URL in `Reference Image URL`.
6. Upload a photo (used as fallback when URL is empty).
7. Click `Generate 4 Avatars`.
8. Download your preferred result(s).

## Requirements

- A valid MiniMax API key with image generation access and billing enabled.
- Internet connection.

## Notes

- This version calls MiniMax `POST /v1/image_generation`.
- In static-server mode, browser calls MiniMax directly.
- If running with Node (`node server.js`), browser can use local `POST /api/generate` proxy.
- On Replit, set `MINIMAX_API_KEY` in Secrets so browser key input is optional.
- Your uploaded photo is sent to MiniMax during generation.
- MiniMax reference image works best with public URLs; local upload is used as fallback.
- API costs depend on your model and usage.
