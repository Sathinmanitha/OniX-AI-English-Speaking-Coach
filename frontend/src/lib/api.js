const configuredBase = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
const localDevBase = "http://localhost:5000";

export const API_BASE = configuredBase || (import.meta.env.DEV ? localDevBase : "");

export function apiUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}

export function friendlyServiceMessage(error, fallback = "OniX is temporarily unavailable. Please try again.") {
  const text = String(error?.message || error || "").toLowerCase();

  if (text.includes("high demand") || text.includes("503") || text.includes("unavailable") || text.includes("busy")) {
    return "OniX is busy for a moment. Please try again in a few seconds.";
  }
  if (text.includes("429") || text.includes("quota") || text.includes("resource_exhausted")) {
    return "OniX has reached a temporary usage limit. Please wait a moment and try again.";
  }
  if (text.includes("econnreset") || text.includes("network") || text.includes("fetch") || text.includes("timed out") || text.includes("timeout")) {
    return "The connection was interrupted briefly. Please try again.";
  }
  if (text.includes("api key") || text.includes("not configured") || text.includes("401")) {
    return "OniX AI is not configured correctly yet. Check the Gemini API key and restart the server.";
  }
  if (text.includes("microphone")) return error?.message || fallback;
  return fallback;
}
