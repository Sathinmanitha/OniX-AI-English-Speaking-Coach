import { apiUrl, friendlyServiceMessage } from "./api.js";

function buildCoachInstructions(settings = {}) {
  const level = settings.level || "Intermediate";
  const correctionMode = settings.correctionMode || "Balanced";
  const accent = settings.accent || "International English";
  const learnerName = settings.learnerName || "learner";
  const topic = settings.topic || "Everyday conversation";

  return `You are OniX, the virtual English coach inside the OniX AI web application. Your coach name is OniX. Never call yourself Alex, Gemini, Google, or any other coach name.

Have a natural spoken English conversation with ${learnerName} while actively helping them improve spoken English.

Learner level: ${level}.
Correction style: ${correctionMode}.
Preferred pronunciation model: ${accent}.
Current practice topic: ${topic}.

Conversation rules:
- Introduce yourself only once near the beginning: "Hi, I'm OniX, your English coach." Then ask one short question.
- Respond quickly. Most replies should be 1-2 short sentences.
- Ask natural follow-up questions so the learner speaks more than you do.
- Use English by default and adapt vocabulary and grammar complexity to the learner's level.
- If there is a meaningful grammar, tense, article, preposition, agreement, word-choice, sentence-structure, or naturalness mistake, respond to the meaning first and then give one concise correction.
- Do not interrupt for tiny style preferences. Do not invent mistakes.
- If the learner says a short acknowledgement such as "no", "yes", "yeah", "okay", "right", "sure", or a single word, accept that short response and continue naturally. Never expand it into words the learner did not say.
- Listen to the audio itself. Do not paraphrase the learner's words and claim that they said the paraphrase.
- When the learner asks how to spell a word, spell the word you actually heard. If the audio is genuinely ambiguous, briefly confirm what word you heard before spelling it rather than confidently guessing a different word.
- If asked how to say something naturally, give one natural version and at most one alternative.
- Be cautious with pronunciation. Mention a pronunciation problem only when you can hear it with reasonable confidence. Never invent numeric pronunciation or phoneme scores.
- Do not treat a legitimate English accent as a mistake.
- For Strict mode, correct more often, but keep every correction brief.
- When usage varies by region or register, explain that briefly.
- Make the experience feel like a responsive human English coach, not a quiz or lecture.
- Keep one consistent speaking identity for the whole session. Never imitate another person, switch character voices, or deliberately change vocal persona. The app-selected voice is fixed until the learner ends the session and chooses a different voice in Settings.

Prioritize a fast conversational response immediately after the learner finishes speaking.`;
}

function floatToPcm16(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function downsample(buffer, inputRate, outputRate = 16000) {
  if (inputRate === outputRate) return buffer;
  if (outputRate > inputRate) return buffer;

  const ratio = inputRate / outputRate;
  const length = Math.round(buffer.length / ratio);
  const result = new Float32Array(length);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      sum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count ? sum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function rms(buffer) {
  if (!buffer.length) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const aligned = bytes.byteLength - (bytes.byteLength % 2);
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + aligned));
}

function pickGeminiVoice(value) {
  const allowed = new Set(["Puck", "Charon", "Fenrir"]);
  return allowed.has(value) ? value : "Puck";
}

async function getToken(path, payload = {}, attempts = 3) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || "OniX could not start the AI session.");
        error.code = data.code || response.status;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      const text = String(error?.message || error || "").toLowerCase();
      const retryable = error?.name === "AbortError"
        || [408, 429, 500, 502, 503, 504].includes(Number(error?.status))
        || text.includes("busy")
        || text.includes("unavailable")
        || text.includes("network")
        || text.includes("fetch");

      if (!retryable || attempt === attempts - 1) break;
      const delay = Math.min(2400, 350 * (2 ** attempt)) + Math.floor(Math.random() * 120);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw new Error(friendlyServiceMessage(lastError, "OniX could not start right now. Please try again."));
}

async function getMicrophone() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (error) {
    if (error?.name === "NotAllowedError") {
      throw new Error("Microphone permission is blocked. Allow microphone access for localhost, then try again.");
    }
    throw new Error("Microphone could not start. Check your browser microphone permission and try again.");
  }
}

export async function createLiveCoach({ settings, onEvent, onState }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot access microphone audio. Use a current version of Chrome or Edge.");
  }

  const sdkPromise = import("@google/genai");
  const sessionTokenPromise = getToken("/api/session/token");
  const microphonePromise = getMicrophone();

  const [{ GoogleGenAI, Modality }, sessionTokenInfo, stream] = await Promise.all([
    sdkPromise,
    sessionTokenPromise,
    microphonePromise
  ]);

  let inputContext;
  let outputContext;
  let processor;
  let source;
  let silentGain;
  let coachSession;
  let transcribeSession;
  let transcribeReconnectTimer;
  let transcribeReconnectAttempts = 0;
  let muted = false;
  let closed = false;
  let nextPlayTime = 0;
  let speechActive = false;
  let speechStartAt = 0;
  let silenceMs = 0;
  let noiseFloor = 0.0018;
  let precisionTranscription = false;
  const preRoll = [];
  const playingSources = new Set();

  const stopPlayback = () => {
    for (const node of playingSources) {
      try { node.stop(); } catch {}
    }
    playingSources.clear();
    nextPlayTime = outputContext?.currentTime || 0;
    onState?.("listening");
  };

  const playPcm24k = async (base64) => {
    if (!base64 || closed) return;
    if (!outputContext) outputContext = new AudioContext({ sampleRate: 24000 });
    if (outputContext.state === "suspended") await outputContext.resume();

    const pcm = base64ToInt16(base64);
    const audioBuffer = outputContext.createBuffer(1, pcm.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;

    const bufferSource = outputContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(outputContext.destination);
    const now = outputContext.currentTime;
    const startAt = Math.max(now + 0.01, nextPlayTime);
    nextPlayTime = startAt + audioBuffer.duration;
    playingSources.add(bufferSource);
    bufferSource.onended = () => {
      playingSources.delete(bufferSource);
      if (!playingSources.size) onState?.("listening");
    };
    bufferSource.start(startAt);
    onState?.("coach-speaking");
  };

  const sendAudioChunk = (base64) => {
    const audio = { data: base64, mimeType: "audio/pcm;rate=16000" };
    try { coachSession?.sendRealtimeInput?.({ audio }); } catch {}
    try { transcribeSession?.sendRealtimeInput?.({ audio }); } catch {}
  };

  const flushAudioStream = () => {
    try { coachSession?.sendRealtimeInput?.({ audioStreamEnd: true }); } catch {}
    try { transcribeSession?.sendRealtimeInput?.({ audioStreamEnd: true }); } catch {}
  };

  const endSpeechTurn = () => {
    if (!speechActive) return;
    const durationMs = Math.max(80, performance.now() - speechStartAt - Math.min(silenceMs, 450));
    speechActive = false;
    silenceMs = 0;
    preRoll.length = 0;
    flushAudioStream();
    onEvent?.({ type: "user.activity.end", durationMs, at: Date.now() });
  };

  const coachAi = new GoogleGenAI({ apiKey: sessionTokenInfo.token });
  // Lock the selected voice once when the live session starts. Reconnects and
  // transcription helpers never mutate this value.
  const voiceName = pickGeminiVoice(settings.voice);

  try {
    coachSession = await coachAi.live.connect({
      model: sessionTokenInfo.liveModel || "gemini-3.8-live",
      callbacks: {
        onopen: () => onState?.("connected"),
        onmessage: (message) => {
          const content = message?.serverContent;
          if (!content) return;

          if (content.interrupted) stopPlayback();

          if (!precisionTranscription && content.interimInputTranscription?.text) {
            onEvent?.({
              type: "session.input_transcript.interim",
              source: "native",
              text: content.interimInputTranscription.text,
              at: Date.now()
            });
          }

          if (!precisionTranscription && content.inputTranscription?.text) {
            onEvent?.({
              type: "session.input_transcript.final",
              source: "native",
              text: content.inputTranscription.text,
              at: Date.now()
            });
          }

          if (content.outputTranscription?.text) {
            onEvent?.({
              type: "session.output_transcript.delta",
              delta: content.outputTranscription.text,
              at: Date.now()
            });
          }

          const parts = content.modelTurn?.parts || [];
          for (const part of parts) {
            if (part?.inlineData?.data) playPcm24k(part.inlineData.data).catch(() => {});
          }

          if (content.turnComplete) onEvent?.({ type: "session.turn.complete", at: Date.now() });
        },
        onerror: (event) => {
          if (closed) return;
          onEvent?.({
            type: "service.notice",
            message: friendlyServiceMessage(event?.message, "OniX had a temporary connection interruption. Conversation will continue if the connection recovers."),
            at: Date.now()
          });
        },
        onclose: () => {
          if (!closed) {
            onEvent?.({ type: "session.closed", reason: "The live connection ended." });
            onState?.("closed");
          }
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildCoachInstructions(settings),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
            endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
            prefixPaddingMs: 80,
            silenceDurationMs: 220
          }
        },
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        }
      }
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(friendlyServiceMessage(error, "OniX could not start the voice session. Please try again in a moment."));
  }

  const locale = ["en-US", "en-GB", "en-IN"].includes(settings.locale) ? settings.locale : "en-US";
  const customVocabulary = ["OniX"];
  const learnerName = String(settings.learnerName || "").trim();
  if (/^[\p{L}][\p{L}' -]{1,40}$/u.test(learnerName)) customVocabulary.push(learnerName);

  const markTranscriptionDegraded = (message) => {
    precisionTranscription = false;
    onEvent?.({
      type: "transcription.degraded",
      message: message || "High-accuracy English transcription is reconnecting. OniX is temporarily using the Live fallback transcript.",
      at: Date.now()
    });
  };

  const connectPrecisionTranscriber = async (tokenInfo) => {
    if (closed || !tokenInfo?.token) return false;

    const transcribeAi = new GoogleGenAI({ apiKey: tokenInfo.token });
    let sessionInstance;

    sessionInstance = await transcribeAi.live.connect({
      model: tokenInfo.transcribeModel || "gemini-3.5-transcribe-live",
      callbacks: {
        onopen: () => {
          if (closed) return;
          transcribeReconnectAttempts = 0;
          precisionTranscription = true;
          onEvent?.({ type: "transcription.ready", mode: "precision", at: Date.now() });
        },
        onmessage: (message) => {
          if (closed || transcribeSession !== sessionInstance) return;
          const content = message?.serverContent;
          if (!content) return;

          if (content.interimInputTranscription?.text) {
            onEvent?.({
              type: "session.input_transcript.interim",
              source: "precision",
              text: content.interimInputTranscription.text,
              at: Date.now()
            });
          }

          if (content.inputTranscription?.text) {
            onEvent?.({
              type: "session.input_transcript.final",
              source: "precision",
              text: content.inputTranscription.text,
              at: Date.now()
            });
          }
        },
        onerror: () => {
          if (closed || transcribeSession !== sessionInstance) return;
          markTranscriptionDegraded("High-accuracy English transcription is reconnecting automatically.");
        },
        onclose: () => {
          if (closed || transcribeSession !== sessionInstance) return;
          transcribeSession = null;
          markTranscriptionDegraded("High-accuracy English transcription is reconnecting automatically.");
          scheduleTranscriberReconnect();
        }
      },
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {
          languageCodes: [locale],
          customVocabulary,
          mode: "VERBATIM"
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
            endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
            prefixPaddingMs: 80,
            silenceDurationMs: 220
          }
        }
      }
    });

    if (closed) {
      try { sessionInstance?.close?.(); } catch {}
      return false;
    }

    transcribeSession = sessionInstance;
    precisionTranscription = true;
    return true;
  };

  const reconnectTranscriber = async () => {
    if (closed) return;
    transcribeReconnectAttempts += 1;
    try {
      const tokenInfo = await getToken("/api/session/token", {
        locale,
        learnerName
      });
      try { transcribeSession?.close?.(); } catch {}
      transcribeSession = null;
      await connectPrecisionTranscriber(tokenInfo);
    } catch (error) {
      markTranscriptionDegraded(error?.message || "High-accuracy English transcription could not reconnect.");
      if (transcribeReconnectAttempts < 4) scheduleTranscriberReconnect();
    }
  };

  function scheduleTranscriberReconnect() {
    if (closed || transcribeReconnectTimer || transcribeReconnectAttempts >= 4) return;
    const delay = Math.min(8000, 700 * (2 ** transcribeReconnectAttempts));
    transcribeReconnectTimer = window.setTimeout(() => {
      transcribeReconnectTimer = null;
      reconnectTranscriber().catch(() => {});
    }, delay);
  }

  Promise.resolve().then(async () => {
    if (closed) return;
    try {
      await connectPrecisionTranscriber(sessionTokenInfo);
    } catch {
      markTranscriptionDegraded("High-accuracy English transcription is temporarily unavailable. OniX is using its standard live transcript and will retry automatically.");
      scheduleTranscriberReconnect();
    }
  });

  try {
    coachSession.sendClientContent({
      turns: [{
        role: "user",
        parts: [{
          text: `Begin the coaching session now. Introduce yourself only as OniX in one short sentence, then ask ${settings.learnerName || "me"} one simple question about ${settings.topic || "everyday conversation"}.`
        }]
      }],
      turnComplete: true
    });
  } catch {}

  inputContext = new AudioContext();
  if (inputContext.state === "suspended") await inputContext.resume();
  source = inputContext.createMediaStreamSource(stream);
  processor = inputContext.createScriptProcessor(2048, 1, 1);
  silentGain = inputContext.createGain();
  silentGain.gain.value = 0;

  processor.onaudioprocess = (event) => {
    if (muted || closed || !coachSession) return;

    const sourceData = event.inputBuffer.getChannelData(0);
    const sampled = downsample(sourceData, inputContext.sampleRate, 16000);
    const level = rms(sampled);
    const pcm = floatToPcm16(sampled);
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const base64 = bytesToBase64(bytes);
    const chunkMs = (sampled.length / 16000) * 1000;

    if (!speechActive) {
      if (level < 0.025) noiseFloor = noiseFloor * 0.95 + level * 0.05;
      const speechThreshold = Math.max(0.0035, Math.min(0.017, noiseFloor * 2.15));

      preRoll.push(base64);
      while (preRoll.length > 4) preRoll.shift();

      if (level >= speechThreshold) {
        speechActive = true;
        speechStartAt = performance.now();
        silenceMs = 0;
        onEvent?.({ type: "user.activity.start", at: Date.now() });
        for (const chunk of preRoll) sendAudioChunk(chunk);
        preRoll.length = 0;
      }
      return;
    }

    sendAudioChunk(base64);

    const releaseThreshold = Math.max(0.0026, Math.min(0.011, noiseFloor * 1.55));
    if (level < releaseThreshold) silenceMs += chunkMs;
    else silenceMs = 0;

    const spokenForMs = performance.now() - speechStartAt;
    const requiredSilenceMs = spokenForMs < 1200 ? 180 : 240;
    if (silenceMs >= requiredSilenceMs) endSpeechTurn();
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(inputContext.destination);

  return {
    provider: "gemini",
    get transcriptionMode() {
      return precisionTranscription ? "precision" : "native";
    },
    mute(value) {
      muted = Boolean(value);
      stream?.getAudioTracks?.().forEach((track) => { track.enabled = !muted; });
      if (muted) endSpeechTurn();
    },
    close() {
      closed = true;
      window.clearTimeout(transcribeReconnectTimer);
      endSpeechTurn();
      flushAudioStream();
      try { transcribeSession?.close?.(); } catch {}
      try { coachSession?.close?.(); } catch {}
      try { processor?.disconnect?.(); } catch {}
      try { source?.disconnect?.(); } catch {}
      try { silentGain?.disconnect?.(); } catch {}
      stream?.getTracks?.().forEach((track) => track.stop());
      stopPlayback();
      inputContext?.close?.().catch?.(() => {});
      outputContext?.close?.().catch?.(() => {});
      onState?.("closed");
    }
  };
}
