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

const REST_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
    grammarIssues: [],
    analysisSource: "empty",
    analysisModel: ""
  };
}

function normalizeFeedback(value, safeText, metadata = {}) {
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
    grammarScore: clampScore(raw.grammarScore, issues.length ? 74 : 94),
    vocabularyScore: clampScore(raw.vocabularyScore, 86),
    clarityScore: clampScore(raw.clarityScore, 88),
    overallScore: clampScore(raw.overallScore, issues.length ? 80 : 92),
    summary: String(
      raw.summary
        || (issues.length
          ? "Good effort. Review the correction below and try the sentence once more."
          : "Your sentence is clear and natural overall.")
    ).trim(),
    vocabularyTip: String(
      raw.vocabularyTip
        || "Keep using complete sentences and vary your everyday expressions."
    ).trim(),
    grammarIssues: issues,
    analysisSource: metadata.analysisSource || raw.analysisSource || "gemini",
    analysisModel: metadata.analysisModel || raw.analysisModel || ""
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
Do not invent mistakes. Respect valid regional English.
Focus on grammar, tense, articles, prepositions, agreement, word choice, spoken naturalness, and clarity.
The transcript can contain speech-recognition errors, so avoid correcting uncertain fragments.
If the sentence is already correct, preserve it and return an empty grammarIssues array.
Give realistic scores from 0 to 100 and short learner-friendly explanations.
Do not change the learner's intended meaning.

Learner level: ${level || "Intermediate"}
Spoken transcript: ${safeText}`;
}

function plainJsonPrompt(prompt) {
  return `${prompt}

Return ONLY one JSON object. Do not use Markdown or code fences.
Use exactly these keys:
correctedSentence, naturalAlternative, grammarScore, vocabularyScore, clarityScore, overallScore, summary, vocabularyTip, grammarIssues.

grammarIssues must be an array of objects with exactly:
part, explanation, correction.`;
}

async function sdkStructuredAnalysis({ ai, model, prompt }) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: feedbackJsonSchema,
      maxOutputTokens: 900
    }
  });

  return parseJsonText(response.text);
}

async function sdkPlainJsonAnalysis({ ai, model, prompt }) {
  const response = await ai.models.generateContent({
    model,
    contents: plainJsonPrompt(prompt),
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 900
    }
  });

  return parseJsonText(response.text);
}

async function restJsonAnalysis({ apiKey, model, prompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const url = `${REST_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: plainJsonPrompt(prompt) }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 900
        }
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.error?.message
        || `Gemini REST request failed with HTTP ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.error?.status || payload?.error?.code || response.status;
      throw error;
    }

    const text = (payload?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("")
      .trim();

    return parseJsonText(text);
  } finally {
    clearTimeout(timeout);
  }
}

function safeErrorSummary(error) {
  const status = error?.status || error?.code || error?.cause?.status || "";
  const raw = String(error?.message || error || "unknown error")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[API_KEY_REDACTED]")
    .replace(/[?&]key=[^&\s]+/gi, "?key=[REDACTED]");
  return `${status ? `${status}: ` : ""}${raw}`.slice(0, 320);
}

function ensureSentenceFormatting(text) {
  let value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return value;
  value = value.charAt(0).toUpperCase() + value.slice(1);
  if (!/[.!?]$/.test(value)) value += ".";
  return value;
}

function localFallbackAnalysis(safeText) {
  let corrected = safeText.replace(/\s+/g, " ").trim();
  const issues = [];

  const addIssue = (part, explanation, correction) => {
    if (issues.length >= 5) return;
    issues.push({ part, explanation, correction });
  };

  const replaceRule = (regex, replacement, explanation, displayPart = null) => {
    const match = corrected.match(regex);
    if (!match) return;
    const before = match[0];
    corrected = corrected.replace(regex, replacement);
    const afterMatch = typeof replacement === "function"
      ? replacement(...match)
      : before.replace(regex, replacement);
    addIssue(displayPart || before, explanation, String(afterMatch || replacement).trim());
  };

  replaceRule(/\bI\s+is\b/i, "I am", "Use “am” with the subject “I”.");
  replaceRule(/\bI\s+are\b/i, "I am", "Use “am” with the subject “I”.");
  replaceRule(/\b(you|we|they)\s+is\b/i, (_, subject) => `${subject} are`, "Use “are” with you, we and they.");
  replaceRule(/\b(he|she|it)\s+are\b/i, (_, subject) => `${subject} is`, "Use “is” with he, she and it.");
  replaceRule(/\bpeople\s+is\b/i, "people are", "“People” is plural, so use “are”.");
  replaceRule(/\bchildren\s+is\b/i, "children are", "“Children” is plural, so use “are”.");
  replaceRule(/\bthere\s+is\s+many\b/i, "there are many", "Use “there are” before plural nouns.");

  replaceRule(/\bI\s+am\s+agree\b/i, "I agree", "“Agree” is a verb, so do not use “am” before it.");
  replaceRule(/\bI\s+have\s+(\d+)\s+years?\s+old\b/i, (_, age) => `I am ${age} years old`, "Use “be” to state age in English.");
  replaceRule(/\bdiscuss\s+about\b/i, "discuss", "“Discuss” does not normally take “about” before its object.");
  replaceRule(/\bmarried\s+with\b/i, "married to", "The usual expression is “married to”.");
  replaceRule(/\bdepend\s+of\b/i, "depend on", "The usual preposition after “depend” is “on”.");
  replaceRule(/\bwent\s+to\s+home\b/i, "went home", "We normally say “go/went home” without “to”.");
  replaceRule(/\bmore\s+better\b/i, "better", "“Better” is already comparative, so “more” is unnecessary.");
  replaceRule(/\binformations\b/i, "information", "“Information” is normally uncountable.");
  replaceRule(/\badvices\b/i, "advice", "“Advice” is normally uncountable.");

  replaceRule(/\b(can|could|should|would|must|may|might)\s+to\s+([a-z]+)\b/i,
    (_, modal, verb) => `${modal} ${verb}`,
    "Do not use “to” after a modal verb.");

  const irregularAfterDid = {
    went: "go", came: "come", saw: "see", ate: "eat", did: "do", had: "have",
    bought: "buy", took: "take", got: "get", made: "make", said: "say",
    told: "tell", thought: "think", knew: "know", felt: "feel", met: "meet",
    left: "leave", brought: "bring", found: "find", spoke: "speak",
    wrote: "write", drank: "drink", ran: "run", drove: "drive"
  };

  for (const [past, base] of Object.entries(irregularAfterDid)) {
    const regex = new RegExp(`\\b(didn't|did not)\\s+${past}\\b`, "i");
    if (regex.test(corrected)) {
      const found = corrected.match(regex)?.[0] || `didn't ${past}`;
      corrected = corrected.replace(regex, (full, did) => `${did} ${base}`);
      addIssue(found, "After “did/didn't”, use the base form of the verb.", `didn't ${base}`);
      break;
    }
  }

  const hasPastCue = /\b(yesterday|last\s+(night|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ago|earlier today)\b/i.test(corrected);
  if (hasPastCue) {
    const pastMap = {
      go: "went", come: "came", see: "saw", eat: "ate", do: "did", have: "had",
      buy: "bought", take: "took", get: "got", make: "made", say: "said",
      tell: "told", think: "thought", know: "knew", feel: "felt", meet: "met",
      leave: "left", bring: "brought", find: "found", speak: "spoke",
      write: "wrote", drink: "drank", run: "ran", drive: "drove"
    };

    for (const [base, past] of Object.entries(pastMap)) {
      const regex = new RegExp(`\\b(I|you|we|they|he|she)\\s+${base}\\b`, "i");
      const match = corrected.match(regex);
      if (match) {
        const original = match[0];
        corrected = corrected.replace(regex, (_, subject) => `${subject} ${past}`);
        addIssue(original, "A finished past-time expression normally needs the past tense.", `${match[1]} ${past}`);
        break;
      }
    }
  }

  const thirdPersonMatch = corrected.match(/\b(he|she|it)\s+(go|do|have|watch|study|try)\b/i);
  if (thirdPersonMatch && !/\b(did|does|can|could|will|would|should|must|may|might)\s+$/i.test(corrected.slice(0, thirdPersonMatch.index))) {
    const forms = { go: "goes", do: "does", have: "has", watch: "watches", study: "studies", try: "tries" };
    const subject = thirdPersonMatch[1];
    const verb = thirdPersonMatch[2].toLowerCase();
    const fixed = `${subject} ${forms[verb]}`;
    corrected = corrected.replace(thirdPersonMatch[0], fixed);
    addIssue(thirdPersonMatch[0], "In the present simple, he/she/it usually takes the third-person verb form.", fixed);
  }

  corrected = ensureSentenceFormatting(corrected);

  const wordCount = safeText.trim().split(/\s+/).filter(Boolean).length;
  const grammarScore = clampScore(96 - issues.length * 10, 85);
  const vocabularyScore = clampScore(wordCount >= 8 ? 88 : wordCount >= 4 ? 84 : 80, 84);
  const clarityScore = clampScore(wordCount >= 4 ? 90 : 82, 88);
  const overallScore = Math.round((grammarScore * 0.45) + (vocabularyScore * 0.25) + (clarityScore * 0.30));

  return {
    correctedSentence: corrected,
    naturalAlternative: corrected,
    grammarScore,
    vocabularyScore,
    clarityScore,
    overallScore,
    summary: issues.length
      ? `Good effort. I found ${issues.length} ${issues.length === 1 ? "point" : "points"} to improve in this turn.`
      : "Your sentence is clear and grammatically natural overall.",
    vocabularyTip: wordCount < 6
      ? "Try extending your answer with one reason, example, or extra detail."
      : "Keep varying your verbs and linking ideas with words such as because, although, and however.",
    grammarIssues: issues,
    analysisSource: "local-fallback",
    analysisModel: "onix-local-grammar"
  };
}

async function tryGeminiModel({ apiKey, model, prompt }) {
  const ai = new GoogleGenAI({ apiKey });
  const attempts = [
    ["sdk-structured", () => sdkStructuredAnalysis({ ai, model, prompt })],
    ["sdk-json", () => sdkPlainJsonAnalysis({ ai, model, prompt })],
    ["rest-json", () => restJsonAnalysis({ apiKey, model, prompt })]
  ];

  let lastError;
  for (const [transport, operation] of attempts) {
    try {
      const parsed = await operation();
      return normalizeFeedback(parsed, "", {
        analysisSource: transport,
        analysisModel: model
      });
    } catch (error) {
      lastError = error;
      console.warn(`[OniX] English analysis ${transport} failed for ${model}: ${safeErrorSummary(error)}`);
    }
  }

  throw lastError || new Error(`Gemini analysis failed for ${model}.`);
}

export async function analyzeEnglish({ apiKey, model, text, level }) {
  const safeText = String(text || "").trim();
  if (!safeText) return emptyFeedback();

  const prompt = buildPrompt(safeText, level);
  const candidateModels = [
    model,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  for (const candidateModel of candidateModels) {
    try {
      const result = await tryGeminiModel({
        apiKey,
        model: candidateModel,
        prompt
      });
      return normalizeFeedback(result, safeText, {
        analysisSource: result.analysisSource,
        analysisModel: result.analysisModel || candidateModel
      });
    } catch {
      // Try the next model. If all remote models fail, the local engine below
      // keeps Live Feedback, Instant Correction and Practice History working.
    }
  }

  console.warn("[OniX] All Gemini text-analysis paths failed. Using the built-in local English feedback engine.");
  return localFallbackAnalysis(safeText);
}
