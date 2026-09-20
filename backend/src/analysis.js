import { GoogleGenAI } from "@google/genai";

const feedbackSchema = {
  type: "object",
  properties: {
    correctedSentence: { type: "string" },
    naturalAlternative: { type: "string" },
    grammarScore: { type: "integer", minimum: 0, maximum: 100 },
    vocabularyScore: { type: "integer", minimum: 0, maximum: 100 },
    clarityScore: { type: "integer", minimum: 0, maximum: 100 },
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    vocabularyTip: { type: "string" },
    grammarIssues: {
      type: "array",
      items: {
        type: "object",
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

export async function analyzeEnglish({ apiKey, model, text, level }) {
  const safeText = String(text || "").trim();
  if (!safeText) return emptyFeedback();

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are the analysis engine for OniX AI, an English speaking coach.
Analyze the learner's transcribed spoken English accurately and concisely.
Do not invent mistakes. Respect valid regional English. Focus on grammar, tense, articles, prepositions, agreement, word choice, spoken naturalness, and clarity.
The transcript can contain speech-recognition errors, so avoid correcting uncertain fragments.
If the sentence is already correct, preserve it and return an empty grammarIssues array.
Give realistic scores from 0 to 100 and short learner-friendly explanations.

Learner level: ${level || "Intermediate"}
Spoken transcript: ${safeText}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: feedbackSchema
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    return parsed;
  } catch (error) {
    const wrapped = new Error(error?.message || "Gemini could not analyze the English transcript.");
    wrapped.status = error?.status || error?.code || 500;
    throw wrapped;
  }
}
