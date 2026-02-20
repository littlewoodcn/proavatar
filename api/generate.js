module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const apiKey = process.env.MINIMAX_API_KEY || body.apiKey;
    const apiBase = process.env.MINIMAX_API_BASE || body.apiBase;
    const prompt = body.prompt;
    const imageReference = body.imageReference;

    if (!apiKey || !apiBase || !prompt || !imageReference) {
      res.status(400).json({
        error:
          'Missing required fields. Configure MINIMAX_API_KEY and MINIMAX_API_BASE in Vercel, or provide key/base from client.',
      });
      return;
    }

    const endpoint = `${String(apiBase).replace(/\/$/, '')}/image_generation`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'image-01',
        prompt,
        aspect_ratio: '1:1',
        response_format: 'base64',
        subject_reference: [
          {
            type: 'character',
            image_file: imageReference,
          },
        ],
      }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = payload?.base_resp?.status_msg || payload?.message || `HTTP ${upstream.status}`;
      res.status(502).json({ error: message });
      return;
    }

    const data = payload?.data;
    const imageBase64 = Array.isArray(data?.image_base64)
      ? data.image_base64[0]
      : data?.image_base64;

    if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
      res.status(200).json({ imageDataUrl: `data:image/png;base64,${imageBase64}` });
      return;
    }

    res.status(502).json({ error: 'MiniMax response missing image_base64 output' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Unexpected server error' });
  }
};
