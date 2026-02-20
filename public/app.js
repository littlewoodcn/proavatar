const MAX_FILE_SIZE = 12 * 1024 * 1024;

const STYLES = [
  {
    key: 'corporate',
    label: 'Corporate Studio',
    prompt:
      'Professional corporate headshot. Preserve the same identity and face from the reference photo. Business formal attire, clean neutral studio background, realistic skin texture, balanced lighting, no text, no watermark.',
  },
  {
    key: 'linkedin',
    label: 'Modern LinkedIn',
    prompt:
      'Modern LinkedIn profile photo. Preserve the same identity and face from the reference photo. Smart business-casual styling, subtle office blur background, approachable expression, realistic photo quality, no text, no watermark.',
  },
  {
    key: 'resume',
    label: 'Minimal Resume',
    prompt:
      'Minimal resume-ready portrait. Preserve the same identity and face from the reference photo. Clean plain light-gray background, professional attire, centered crop, realistic and crisp, no text, no watermark.',
  },
  {
    key: 'creative',
    label: 'Creative Professional',
    prompt:
      'Creative but professional avatar. Preserve the same identity and face from the reference photo. Stylish business-appropriate outfit, subtle premium gradient background, soft cinematic light, realistic output, no text, no watermark.',
  },
];

const input = document.getElementById('photoInput');
const dropzone = document.getElementById('dropzone');
const generateBtn = document.getElementById('generateBtn');
const resetBtn = document.getElementById('resetBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiBaseSelect = document.getElementById('apiBaseSelect');
const referenceUrlInput = document.getElementById('referenceUrlInput');
const results = document.getElementById('results');
const statusPanel = document.getElementById('statusPanel');
const statusText = document.getElementById('statusText');
const loadingFill = document.getElementById('loadingFill');

let selectedFile = null;
let isGenerating = false;

const savedKey = localStorage.getItem('avatar_app_minimax_key');
if (savedKey) {
  apiKeyInput.value = savedKey;
}
updateGenerateAvailability();

input.addEventListener('change', (event) => {
  if (!event.target.files?.length) return;
  useFile(event.target.files[0]);
});

apiKeyInput.addEventListener('input', () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('avatar_app_minimax_key', key);
  } else {
    localStorage.removeItem('avatar_app_minimax_key');
  }
  updateGenerateAvailability();
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
});

dropzone.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.files?.length) return;
  useFile(event.dataTransfer.files[0]);
});

generateBtn.addEventListener('click', async () => {
  if (!selectedFile || isGenerating) return;
  await generateAvatars();
});

resetBtn.addEventListener('click', () => {
  selectedFile = null;
  input.value = '';
  resetBtn.disabled = true;
  isGenerating = false;
  results.hidden = true;
  statusPanel.hidden = true;
  loadingFill.style.width = '0%';
  statusText.textContent = 'Preparing...';
  updateGenerateAvailability();
  clearCanvases();
});

document.querySelectorAll('[data-download]').forEach((button) => {
  button.addEventListener('click', () => {
    const style = button.getAttribute('data-download');
    const canvas = document.getElementById(`canvas-${style}`);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `avatar-${style}.png`;
    link.click();
  });
});

function updateGenerateAvailability() {
  const hasFile = selectedFile !== null;
  generateBtn.disabled = !hasFile || isGenerating;
}

function useFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    alert('Image is too large. Please use a file under 12 MB.');
    return;
  }

  selectedFile = file;
  resetBtn.disabled = false;
  results.hidden = true;
  statusPanel.hidden = false;
  loadingFill.style.width = '100%';
  statusText.textContent = `${selectedFile.name} ready. Click "Generate 4 Avatars".`;
  updateGenerateAvailability();
}

async function generateAvatars() {
  const apiKey = apiKeyInput.value.trim();

  isGenerating = true;
  updateGenerateAvailability();
  statusPanel.hidden = false;
  results.hidden = false;
  loadingFill.style.width = '0%';
  statusText.textContent = 'Starting AI generation...';

  try {
    const referenceUrl = referenceUrlInput.value.trim();
    const imageReference = referenceUrl || (await fileToDataUrl(selectedFile));
    const failures = [];

    for (let i = 0; i < STYLES.length; i += 1) {
      const style = STYLES[i];
      statusText.textContent = `Generating ${style.label}...`;

      try {
        const imageUrl = await requestStyleAvatarWithRetry(style, imageReference, apiKey, apiBaseSelect.value);
        await renderToCanvas(imageUrl, style.key);
      } catch (styleErr) {
        console.error(`${style.label} failed`, styleErr);
        failures.push(`${style.label}: ${String(styleErr.message || styleErr)}`);
      }

      const pct = Math.round(((i + 1) / STYLES.length) * 100);
      loadingFill.style.width = `${pct}%`;
      statusText.textContent = `${style.label} done (${pct}%)`;
    }

    if (failures.length === 0) {
      statusText.textContent = 'Done. Compare and download your AI avatars.';
    } else {
      statusText.textContent = `Completed with ${failures.length} failed style(s).`;
      alert(`Some styles failed:\n- ${failures.join('\n- ')}`);
    }
  } catch (error) {
    console.error(error);
    const detail =
      error &&
      ['failed to fetch', 'load failed'].some((term) =>
        String(error.message || '').toLowerCase().includes(term)
      )
        ? 'Network blocked request. Start a local server first (`ruby -run -e httpd . -p 3000`) and open http://localhost:3000/public/. If it still fails, switch API Region and use a public Reference Image URL.'
        : error.message;
    statusText.textContent = 'Generation failed. Check API key, quota, and network, then try again.';
    alert(`AI generation failed: ${detail}`);
  } finally {
    isGenerating = false;
    updateGenerateAvailability();
  }
}

async function requestStyleAvatarWithRetry(style, imageReference, apiKey, apiBase) {
  const maxAttempts = 3;
  let lastErr = new Error('Unknown generation error');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestStyleAvatar(style, imageReference, apiKey, apiBase);
    } catch (err) {
      lastErr = err;
      const message = String(err?.message || '').toLowerCase();
      const shouldRetry =
        attempt < maxAttempts &&
        (message.includes('429') ||
          message.includes('rate') ||
          message.includes('timeout') ||
          message.includes('temporar') ||
          message.includes('busy') ||
          message.includes('failed to fetch') ||
          message.includes('load failed') ||
          message.includes('http 5'));

      if (!shouldRetry) {
        throw err;
      }

      const waitMs = attempt * 2500;
      statusText.textContent = `${style.label} retrying (${attempt}/${maxAttempts - 1})...`;
      await delay(waitMs);
    }
  }

  throw lastErr;
}

async function requestStyleAvatar(style, imageReference, apiKey, apiBase) {
  try {
    return await requestViaLocalProxy(style, imageReference, apiKey, apiBase);
  } catch (proxyErr) {
    const msg = String(proxyErr?.message || '').toLowerCase();
    const backendMissing =
      msg.includes('404') ||
      msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('network');
    if (!backendMissing) {
      throw proxyErr;
    }
    return await requestDirectMiniMax(style, imageReference, apiKey, apiBase, proxyErr);
  }
}

async function renderToCanvas(imageSrc, styleKey) {
  const img = await loadImage(imageSrc);
  const canvas = document.getElementById(`canvas-${styleKey}`);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load generated image.'));
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read source image file.'));
    reader.readAsDataURL(file);
  });
}

async function requestViaLocalProxy(style, imageReference, apiKey, apiBase) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      apiBase,
      prompt: style.prompt,
      imageReference,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  if (typeof payload?.imageDataUrl === 'string' && payload.imageDataUrl.length > 0) {
    return payload.imageDataUrl;
  }

  throw new Error('No image returned from local generation API.');
}

async function requestDirectMiniMax(style, imageReference, apiKey, apiBase, proxyErr) {
  if (proxyErr && String(proxyErr.message || '').includes('404')) {
    // Static server mode (python/ruby) has no /api/generate endpoint; call MiniMax directly.
  }

  const response = await fetch(`${apiBase}/image_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'image-01',
      prompt: style.prompt,
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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload?.base_resp?.status_msg || payload?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = payload?.data;
  if (!data) {
    throw new Error('No image returned from MiniMax API.');
  }

  if (Array.isArray(data.image_base64) && data.image_base64.length > 0) {
    return `data:image/png;base64,${data.image_base64[0]}`;
  }

  if (typeof data.image_base64 === 'string' && data.image_base64.length > 0) {
    return `data:image/png;base64,${data.image_base64}`;
  }

  if (Array.isArray(data.image_urls) && data.image_urls.length > 0) {
    return data.image_urls[0];
  }

  if (data.image_url) {
    return data.image_url;
  }

  throw new Error('Unsupported MiniMax image response format.');
}

function clearCanvases() {
  for (const style of STYLES) {
    const canvas = document.getElementById(`canvas-${style.key}`);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
