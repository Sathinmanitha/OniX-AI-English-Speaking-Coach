import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { analyzeEnglish } from "./analysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });

const app = express();
const port = Number(process.env.PORT || 5000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const allowedOrigins = new Set([
  frontendOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: "2mb" }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rawErrorText(error) {
  const pieces = [
    error?.message,
    error?.status,
    error?.code,
    error?.cause?.message,
    error?.cause?.code
  ].filter(Boolean);
  return pieces.join(" ");
}

function errorStatus(error) {
  const direct = Number(error?.status || error?.code || error?.cause?.status || 0);
  if (Number.isFinite(direct) && direct >= 100 && direct <= 599) return direct;
  const match = rawErrorText(error).match(/(?:code|status)[^0-9]{0,8}(\d{3})/i);
  return match ? Number(match[1]) : 0;
}

function isTransientGeminiError(error) {
  const status = errorStatus(error);
  const text = rawErrorText(error).toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status)
    || text.includes("unavailable")
    || text.includes("high demand")
    || text.includes("resource_exhausted")
    || text.includes("econnreset")
    || text.includes("etimedout")
    || text.includes("fetch failed")
    || text.includes("network");
}

function publicGeminiError(error) {
  const status = errorStatus(error);
  const text = rawErrorText(error).toLowerCase();

  if (text.includes("api key") || text.includes("api_key") || status === 401) {
    return {
      status: 401,
      code: "AUTH_ERROR",
      message: "OniX could not verify the Gemini connection. Check the API key and restart the server."
    };
  }

  if (status === 429 || text.includes("quota") || text.includes("resource_exhausted")) {
    return {
      status: 429,
      code: "BUSY",
      message: "OniX is receiving a lot of requests right now. Please wait a moment and try again."
    };
  }

  if (status === 503 || text.includes("high demand") || text.includes("unavailable")) {
    return {
      status: 503,
      code: "TEMPORARILY_UNAVAILABLE",
      message: "OniX is temporarily busy. Please try again in a few seconds."
    };
  }

  if ((text.includes("not found") || text.includes("unsupported")) && text.includes("model")) {
    return {
      status: 400,
      code: "MODEL_ERROR",
      message: "OniX could not start the selected AI model. Check the model names in the .env file."
    };
  }

  if (text.includes("econnreset") || text.includes("etimedout") || text.includes("network") || text.includes("fetch failed")) {
    return {
      status: 503,
      code: "NETWORK_ERROR",
      message: "OniX had a temporary network interruption. Please try again."
    };
  }

  return {
    status: status >= 400 && status <= 599 ? status : 500,
    code: "SERVICE_ERROR",
    message: "OniX could not complete that request right now. Please try again."
  };
}

async function withRetry(operation, { attempts = 4, baseDelayMs = 450, label = "Gemini request" } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isTransientGeminiError(error);
      const finalAttempt = attempt === attempts - 1;

      if (!retryable || finalAttempt) throw error;

      const jitter = Math.floor(Math.random() * 180);
      const delay = Math.min(5000, baseDelayMs * (2 ** attempt)) + jitter;
      console.warn(`[OniX] ${label} temporarily unavailable. Retrying ${attempt + 1}/${attempts - 1} in ${delay}ms.`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function requireGeminiKey(res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      ok: false,
      code: "NOT_CONFIGURED",
      message: "OniX AI is not configured yet. Add the Gemini API key to the root .env file and restart the server."
    });
    return null;
  }
  return apiKey;
}

async function createEphemeralToken(apiKey, uses = 2) {
  const ai = new GoogleGenAI({ apiKey });
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  return withRetry(
    () => ai.authTokens.create({
      config: {
        uses,
        expireTime,
        newSessionExpireTime
      }
    }),
    { attempts: 4, baseDelayMs: 400, label: "session token" }
  );
}

async function analyzeWithFallback({ apiKey, text, level }) {
  const primary = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
  const fallback = process.env.GEMINI_TEXT_FALLBACK_MODEL || "gemini-3.5-flash";
  const models = [...new Set([primary, fallback].filter(Boolean))];
  let lastError;

  for (const model of models) {
    try {
      return await withRetry(
        () => analyzeEnglish({ apiKey, model, text, level }),
        { attempts: model === primary ? 3 : 2, baseDelayMs: 350, label: `English analysis (${model})` }
      );
    } catch (error) {
      lastError = error;
      if (!isTransientGeminiError(error)) throw error;
      if (model !== models.at(-1)) {
        console.warn(`[OniX] ${model} is busy. Switching English feedback to ${models[models.indexOf(model) + 1]}.`);
      }
    }
  }

  throw lastError;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    provider: "gemini",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
    transcribeModel: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe-live",
    textModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
    textFallbackModel: process.env.GEMINI_TEXT_FALLBACK_MODEL || "gemini-3.5-flash"
  });
});

// One short-lived token can be used twice: once for the conversational Live
// session and once for the precision transcription session. This avoids two
// simultaneous token provisioning calls when the user presses Start.
app.post("/api/session/token", async (req, res) => {
  try {
    const apiKey = requireGeminiKey(res);
    if (!apiKey) return;

    const token = await createEphemeralToken(apiKey, 2);
    res.json({
      ok: true,
      token: token.name,
      liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
      transcribeModel: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe-live"
    });
  } catch (error) {
    const publicError = publicGeminiError(error);
    console.warn(`[OniX] Session token failed (${publicError.code}).`);
    res.status(publicError.status).json({ ok: false, code: publicError.code, message: publicError.message });
  }
});

// Backwards-compatible routes for older frontend builds. They use the same
// retry/sanitization logic and never return raw provider JSON to the browser.
for (const route of ["/api/live/token", "/api/transcribe/token"]) {
  app.post(route, async (req, res) => {
    try {
      const apiKey = requireGeminiKey(res);
      if (!apiKey) return;
      const token = await createEphemeralToken(apiKey, 1);
      res.json({
        ok: true,
        token: token.name,
        liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
        transcribeModel: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe-live"
      });
    } catch (error) {
      const publicError = publicGeminiError(error);
      console.warn(`[OniX] Legacy token route failed (${publicError.code}).`);
      res.status(publicError.status).json({ ok: false, code: publicError.code, message: publicError.message });
    }
  });
}

app.post("/api/analyze", async (req, res) => {
  try {
    const apiKey = requireGeminiKey(res);
    if (!apiKey) return;

    const feedback = await analyzeWithFallback({
      apiKey,
      text: req.body?.text,
      level: req.body?.level
    });

    res.json({ ok: true, ...feedback });
  } catch (error) {
    const publicError = publicGeminiError(error);
    console.warn(`[OniX] English feedback unavailable (${publicError.code}).`);
    res.status(publicError.status).json({ ok: false, code: publicError.code, message: publicError.message });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.warn("[OniX] Backend request could not be completed.");
  return res.status(500).json({
    ok: false,
    code: "BACKEND_ERROR",
    message: "OniX had a temporary server problem. Please try again."
  });
});

app.listen(port, () => {
  console.log(`OniX AI backend running on http://localhost:${port}`);
  console.log(`Gemini key loaded: ${Boolean(process.env.GEMINI_API_KEY) ? "yes" : "NO - API key missing"}`);
  console.log(`Gemini Live model: ${process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live"}`);
  console.log(`Gemini Transcribe model: ${process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe-live"}`);
  console.log(`Gemini text model: ${process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash"}`);
  console.log(`Gemini text fallback: ${process.env.GEMINI_TEXT_FALLBACK_MODEL || "gemini-3.5-flash"}`);
});
