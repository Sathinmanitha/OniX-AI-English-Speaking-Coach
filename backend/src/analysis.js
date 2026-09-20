import { GoogleGenAI } from "@google/genai";

const feedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    correctedSentence: {
      type: "string",
      description: "The learner sentence corrected only where needed. Preserve the original meaning."
    },
    naturalAlternative: {
      type: "string",
      description: "A natural spoken-English alternative that preserves the learner's meaning."
    },
    grammarScore: { type: "integer", minimum: 0, maximum: 100 },
    vocabularyScore: { type: "integer", minimum: 0, maximum: 100 },
    clarityScore: { type: "integer", minimum: 0, maximum: 100 },
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    summary: {
      type: "string",
      description: "One short, encouraging and specific sentence about the learner's English."
    },
    vocabularyTip: {
      type: "string",
      description: "One concise vocabulary or natural-expression tip."
    },
    grammarIssues: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          part: { type: "string" },
          explanation: { type: "string" },
          correction: { type: "string" }
        },
        required: ["part", "explanation", "correction"]
      }
    }
  },
  required: [
    "correctedSentence",
    "naturalAlternative",
    "grammarScore",
    "vocabularyScore",
    "clarityScore",
    "overallScore",
    "summary",
    "vocabularyTip",
    "grammarIssues"
  ]
};

function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function emptyFeedback() {
  return {
    correctedSentence: "",
    naturalAlternative: "",
    grammarScore: 0,
    vocabularyScore: 0,
    clarityScore: 0,
    overallScore: 0,
    summary: "No speech was detected.",
    vocabularyTip: "",
    grammarIssues: []
  };
}

function normalizeFeedback(value, safeText) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const issues = Array.isArray(raw.grammarIssues)
    ? raw.grammarIssues
        .filter((item) => item && typeof item === "object")
        .slice(0, 5)
        .map((item) => ({
          part: String(item.part || "").trim(),
          explanation: String(item.explanation || "").trim(),
          correction: String(item.correction || "").trim()
        }))
        .filter((item) => item.part || item.explanation || item.correction)
    : [];

  const correctedSentence = String(raw.correctedSentence || safeText).trim() || safeText;
  const naturalAlternative = String(raw.naturalAlternative || correctedSentence).trim() || correctedSentence;

  return {
    correctedSentence,
    naturalAlternative,
    grammarScore: clampScore(raw.grammarScore, issues.length ? 72 : 92),
    vocabularyScore: clampScore(raw.vocabularyScore, 85),
    clarityScore: clampScore(raw.clarityScore, 85),
    overallScore: clampScore(raw.overallScore, issues.length ? 78 : 90),
    summary: String(raw.summary || (issues.length
      ? "Good effort. Review the correction below and try the sentence once more."
      : "Your sentence is clear and natural overall.")).trim(),
    vocabularyTip: String(raw.vocabularyTip || "Keep using complete sentences and vary your everyday expressions.").trim(),
    grammarIssues: issues
  };
}

function parseJsonText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Gemini returned an empty analysis response.");

  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch {
          continue;
        }
      }
      return parsed;
    } catch {
      // Try the next candidate.
    }
  }

  const error = new Error("Gemini returned feedback in an unexpected format.");
  error.code = "ANALYSIS_PARSE_ERROR";
  throw error;
}

function buildPrompt(safeText, level) {
  return `You are the analysis engine for OniX AI, an English speaking coach.
Analyze the learner's transcribed spoken English accurately and concisely.
Do not invent mistakes. Respect valid regional English. Focus on grammar, tense, articles, prepositions, agreement, word choice, spoken naturalness, and clarity.
The transcript can contain speech-recognition errors, so avoid correcting uncertain fragments.
If the sentence is already correct, preserve it and return an empty grammarIssues array.
Give realistic scores from 0 to 100 and short learner-friendly explanations.
Do not change the learner's intended meaning.

Learner level: ${level || "Intermediate"}
Spoken transcript: ${safeText}`;
}

async function structuredAnalysis({ ai, model, prompt }) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: feedbackJsonSchema
    }
  });

  return parseJsonText(response.text);
}

async function plainJsonAnalysis({ ai, model, prompt }) {
  const plainPrompt = `${prompt}

Return ONLY one JSON object. Do not use Markdown or code fences. Use exactly these keys:
correctedSentence, naturalAlternative, grammarScore, vocabularyScore, clarityScore, overallScore, summary, vocabularyTip, grammarIssues.
grammarIssues must be an array of objects with exactly: part, explanation, correction.`;

  const response = await ai.models.generateContent({
    model,
    contents: plainPrompt
  });

  return parseJsonText(response.text);
}

export async function analyzeEnglish({ apiKey, model, text, level }) {
  const safeText = String(text || "").trim();
  if (!safeText) return emptyFeedback();

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(safeText, level);
  let structuredError;

  try {
    const parsed = await structuredAnalysis({ ai, model, prompt });
    return normalizeFeedback(parsed, safeText);
  } catch (error) {
    structuredError = error;
  }

  try {
    const parsed = await plainJsonAnalysis({ ai, model, prompt });
    return normalizeFeedback(parsed, safeText);
  } catch (fallbackError) {
    const wrapped = new Error(
      fallbackError?.message
      || structuredError?.message
      || "Gemini could not analyze the English transcript."
    );
    wrapped.status = fallbackError?.status
      || fallbackError?.code
      || structuredError?.status
      || structuredError?.code
      || 500;
    wrapped.cause = fallbackError;
    throw wrapped;
  }
}
