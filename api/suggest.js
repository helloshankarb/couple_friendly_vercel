// Vercel Serverless Function — Couple Friendly AI Proxy
// Stores API keys as Vercel environment variables (never in the APK)
// Deploy: vercel --prod

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Gemini model fallback chain
// Note: gemini-2.0-flash-lite removed — has limit:0 on free tier projects
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b"
];

const NVIDIA_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b",
];

// Loaded from Vercel Environment Variables (Dashboard → Settings → Environment Variables)
function shuffle(arr) {
  // Fisher-Yates shuffle — randomize key order on every request
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getGroqKeys() {
  return shuffle([
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
    process.env.GROQ_KEY_6,
    process.env.GROQ_KEY_7,
    process.env.GROQ_KEY_8,
  ].filter(Boolean));
}

function getNvidiaKeys() {
  return shuffle([
    process.env.NVIDIA_KEY_1,
    process.env.NVIDIA_KEY_2,
    process.env.NVIDIA_KEY_3,
    process.env.NVIDIA_KEY_4,
    process.env.NVIDIA_KEY_5,
    process.env.NVIDIA_KEY_6,
    process.env.NVIDIA_KEY_7,
    process.env.NVIDIA_KEY_8,
  ].filter(Boolean));
}

function getGeminiKeys() {
  return shuffle([
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4,
    process.env.GEMINI_KEY_5,
    process.env.GEMINI_KEY_6,
    process.env.GEMINI_KEY_7,
    process.env.GEMINI_KEY_8,
    process.env.GEMINI_KEY, // legacy single key
  ].filter(Boolean));
}

// Optional: simple shared secret to prevent random people calling your endpoint
function isAuthorized(req) {
  const secret = process.env.APP_SECRET;
  if (!secret) return true; // no secret set = open
  return req.headers["x-app-secret"] === secret;
}

function buildSystemPrompt(tone) {
  return `You are a native Telugu speaker writing WhatsApp flirt replies in TANGLISH (Telugu spoken in English alphabet). You grew up speaking Telugu, not translating it.

TONE: ${tone}

HARD RULES:
1. ROMAN SCRIPT ONLY — Telugu in English letters. Never Telugu script (అ బ గ etc).
2. Sound like a real Telugu person texting — NOT like a translation app.
3. 1-2 lines max. 6-12 words. Punchy, casual, WhatsApp speed.
4. Use these NATURALLY (don't force all of them): ra, da, le, di, ga, kada, ani, enti, ayyo, naa, nee, mee, ikkade, cheppu, chuddu, em, ela, evaru, nuvvu, nenu, memu, meeru.
5. Max 1 emoji per reply, at the very end only.
6. Vary each reply — different structure, different slang.
7. NEVER say "I am AI". NEVER use English phrases like "my heart", "I feel", "you are".

BAD (avoid — sounds translated):
❌ "Nee maatani ardham ayyindi bujji"
❌ "Nee gunde naku telusu"
❌ "Nenu nee kosam wait chestunna"
❌ "Nuvvu chala beautiful ga unnavu"

GOOD (sounds real):
✅ "Enti ra, ila cheppakunda velipoyav?" 
✅ "Nuvvu ledante boring ga undi le bujji 😒"
✅ "Ayyo, naa gurinchi alaa anukovadam fair kadu kada 🥺"
✅ "Cheppu da, ikkade unna — miss avutunna"
✅ "Okka message ki ila feel avutava ra nee valla"

TONE GUIDE:
- romantic: warm, slightly poetic, heartfelt — like a close boyfriend
- sweet: caring, soft teasing, cozy
- funny: desi Gen-Z wit — sarcasm, playful roast, light poke
- bold: confident, slightly daring — 😏 never explicit

OUTPUT FORMAT — exactly this, nothing else:
1. [reply]
2. [reply]
3. [reply]`;
}

async function callGroq(apiKey, model, incoming, tone, history) {
  const messages = [
    { role: "system", content: buildSystemPrompt(tone) },
  ];
  if (history && history.length > 0) {
    messages.push({ role: "user", content: `Chat history:\n${history.slice(-4).join("\n")}` });
  }
  messages.push({ role: "user", content: `Reply to: "${incoming}"` });

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages, max_tokens: 256, temperature: 0.85 })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || res.statusText;
      console.error(`[Groq] ${model} HTTP ${res.status}: ${msg}`);
      return { error: `Groq ${res.status}: ${msg}` };
    }
    const data = await res.json();
    return parseReplies(data?.choices?.[0]?.message?.content);
  } catch (e) {
    console.error(`[Groq] ${model} exception: ${e.message}`);
    return { error: `Groq exception: ${e.message}` };
  }
}

async function callNvidia(apiKey, model, incoming, tone, history) {
  const messages = [
    { role: "system", content: buildSystemPrompt(tone) },
  ];
  if (history && history.length > 0) {
    messages.push({ role: "user", content: `Chat history:\n${history.slice(-4).join("\n")}` });
  }
  messages.push({ role: "user", content: `Reply to: "${incoming}"` });

  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages, max_tokens: 256, temperature: 0.85 })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || res.statusText;
      console.error(`[NVIDIA] ${model} HTTP ${res.status}: ${msg}`);
      return { error: `NVIDIA ${res.status}: ${msg}` };
    }
    const data = await res.json();
    return parseReplies(data?.choices?.[0]?.message?.content);
  } catch (e) {
    console.error(`[NVIDIA] ${model} exception: ${e.message}`);
    return { error: `NVIDIA exception: ${e.message}` };
  }
}

async function callGemini(apiKey, model, incoming, tone, history) {
  const prompt = buildSystemPrompt(tone) + `\n\nChat history: ${(history || []).slice(-4).join(" | ")}\nReply to: "${incoming}"`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.85 }
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || res.statusText;
      console.error(`[Gemini] ${model} HTTP ${res.status}: ${msg}`);
      return { error: `Gemini ${res.status}: ${msg}` };
    }
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseReplies(rawText);
    if (!parsed) {
      console.error(`[Gemini] ${model} parse failed. Raw: ${String(rawText).slice(0, 200)}`);
      return { error: `Gemini ${model} parse failed: ${String(rawText).slice(0, 100)}` };
    }
    return parsed;
  } catch (e) {
    console.error(`[Gemini] ${model} exception: ${e.message}`);
    return { error: `Gemini exception: ${e.message}` };
  }
}

function parseReplies(text) {
  if (!text) return null;
  const clean = text.replace(/\*\*/g, "").trim();
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
  const replies = [];
  for (const line of lines) {
    // Match: "1. reply", "1) reply", "- reply", or bare lines if we only have 3
    const match = line.match(/^(?:[1-3][.)\s]|[-•]\s*)(.+)$/);
    if (match) replies.push(match[1].trim());
    if (replies.length === 3) break;
  }
  // Fallback: if numbered parsing failed, take first 3 non-empty lines
  if (replies.length < 2) {
    const bare = lines.filter(l => l.length > 5).slice(0, 3);
    return bare.length >= 2 ? bare : null;
  }
  return replies;
}

export default async function handler(req, res) {
  // CORS headers (needed for any non-browser client)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const { incoming, tone = "romantic", history = [], provider = "auto" } = req.body || {};
  if (!incoming) return res.status(400).json({ error: "Missing 'incoming' field" });

  const geminiKeys = getGeminiKeys();
  const groqKeys   = getGroqKeys();
  const nvidiaKeys = getNvidiaKeys();

  let lastError = "No API keys configured";

  // provider: "auto" | "groq" | "gemini" | "nvidia"
  // "auto": NVIDIA → Groq → Gemini (best model first, graceful fallback)
  const tryNvidia = provider === "auto" || provider === "nvidia";
  const tryGroq   = provider === "auto" || provider === "groq";
  const tryGemini = provider === "auto" || provider === "gemini";

  if (tryNvidia) {
    for (const model of NVIDIA_MODELS) {
      for (const key of nvidiaKeys) {
        const result = await callNvidia(key, model, incoming, tone, history);
        if (Array.isArray(result)) {
          return res.json({ suggestions: result, source: `nvidia/${model}` });
        }
        if (result?.error) lastError = result.error;
      }
    }
    if (provider === "nvidia") {
      console.error(`[suggest] All NVIDIA keys failed. Last: ${lastError}`);
      return res.status(503).json({ error: "All NVIDIA engines unavailable", lastError, suggestions: [] });
    }
    console.warn(`[suggest] NVIDIA failed. Falling back to Groq.`);
  }

  if (tryGroq) {
    for (const model of GROQ_MODELS) {
      for (const key of groqKeys) {
        const result = await callGroq(key, model, incoming, tone, history);
        if (Array.isArray(result)) {
          return res.json({ suggestions: result, source: `groq/${model}` });
        }
        if (result?.error) lastError = result.error;
      }
    }
    if (provider === "groq") {
      console.error(`[suggest] All Groq keys failed. Last: ${lastError}`);
      return res.status(503).json({ error: "All Groq engines unavailable", lastError, suggestions: [] });
    }
    console.warn(`[suggest] Groq failed. Falling back to Gemini.`);
  }

  if (tryGemini) {
    for (const model of GEMINI_MODELS) {
      for (const key of geminiKeys) {
        const result = await callGemini(key, model, incoming, tone, history);
        if (Array.isArray(result)) {
          return res.json({ suggestions: result, source: `gemini/${model}` });
        }
        if (result?.error) lastError = result.error;
      }
    }
    if (provider === "gemini") {
      console.error(`[suggest] All Gemini keys failed. Last: ${lastError}`);
      return res.status(503).json({ error: "All Gemini engines unavailable", lastError, suggestions: [] });
    }
  }

  // 3. All failed
  console.error(`[suggest] All engines failed. Last error: ${lastError}`);
  return res.status(503).json({ error: "All AI engines unavailable", lastError, suggestions: [] });
}
