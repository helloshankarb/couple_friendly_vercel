// Vercel Serverless Function — Couple Friendly AI Proxy
// Stores API keys as Vercel environment variables (never in the APK)
// Deploy: vercel --prod

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Gemini model fallback chain (if one model is overloaded, try next)
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.0-flash-lite"
];

const GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b"
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
  return `You are an elite Telugu flirting reply generator for WhatsApp. Write ONLY in ROMAN SCRIPT TANGLISH — Telugu words in English alphabet, never Telugu script.

TONE: ${tone}
RULES:
1. Roman script only — Telugu in English alphabet.
2. Short & punchy — 1-2 lines, 5-10 words. WhatsApp-style.
3. Use: bangaram, bujji, baby, naa, nee, kadaa, le, rey, enti, ayyo naturally.
4. NO robotic English-to-Telugu translations.
5. Generate exactly 3 DIFFERENT replies — vary structure, slang, emojis.
6. Max 1 emoji per reply at the end.
7. Never reveal you are AI.
8. If message is sad/angry: switch to comforting tone, never flirty.

TONE GUIDE:
- romantic: sincere boyfriend — warm, loving, poetic Tanglish
- sweet: cozy & warm — friendly, caring
- funny: desi Gen-Z wit — playful, light teasing
- bold: confident flirty — 😏 never explicit

OUTPUT FORMAT (exactly this, nothing else):
1. [reply one]
2. [reply two]
3. [reply three]`;
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

  const { incoming, tone = "romantic", history = [] } = req.body || {};
  if (!incoming) return res.status(400).json({ error: "Missing 'incoming' field" });

  const geminiKeys = getGeminiKeys();
  const groqKeys = getGroqKeys();

  let lastError = "No API keys configured";

  // ── Phase 1: Gemini — best model first, try ALL keys before falling back ──
  // Strategy: exhaust all keys on gemini-2.0-flash before trying gemini-1.5-flash, etc.
  // This maximises free-tier quota usage across multiple accounts.
  for (const model of GEMINI_MODELS) {
    for (const key of geminiKeys) {
      const result = await callGemini(key, model, incoming, tone, history);
      if (Array.isArray(result)) {
        return res.json({ suggestions: result, source: `gemini/${model}` });
      }
      if (result?.error) {
        lastError = result.error;
        // If this key hit a hard quota (429) skip remaining models for this key
        // by just recording the error — the outer loop moves to the next key automatically
      }
    }
  }

  // ── Phase 2: Groq fallback — only reached if ALL Gemini keys/models failed ──
  console.warn(`[suggest] All Gemini keys failed (${geminiKeys.length} keys × ${GEMINI_MODELS.length} models). Falling back to Groq.`);
  for (const model of GROQ_MODELS) {
    for (const key of groqKeys) {
      const result = await callGroq(key, model, incoming, tone, history);
      if (Array.isArray(result)) {
        return res.json({ suggestions: result, source: `groq/${model}` });
      }
      if (result?.error) lastError = result.error;
    }
  }

  // 3. All failed
  console.error(`[suggest] All engines failed. Last error: ${lastError}`);
  return res.status(503).json({ error: "All AI engines unavailable", lastError, suggestions: [] });
}
