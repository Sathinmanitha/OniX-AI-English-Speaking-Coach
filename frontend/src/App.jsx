const assetUrl = (file) =>
  `${import.meta.env.BASE_URL}assets/${file}`;
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Check,
  CircleStop,
  Gauge,
  Headphones,
  History,
  Languages,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  Volume2,
  WandSparkles,
  X
} from "lucide-react";
import { createLiveCoach } from "./lib/liveCoach.js";
import { apiUrl, friendlyServiceMessage } from "./lib/api.js";

const defaultSettings = {
  learnerName: "",
  level: "Intermediate",
  correctionMode: "Balanced",
  accent: "International English",
  locale: "en-US",
  voice: "Puck",
  topic: "Everyday conversation"
};

const topicOptions = [
  "Everyday conversation",
  "Job interview",
  "Travel English",
  "Workplace English",
  "Presentation practice",
  "Free conversation"
];

const maleVoiceOptions = [
  { value: "Puck", label: "James", style: "Upbeat" },
  { value: "Charon", label: "Daniel", style: "Informative" },
  { value: "Fenrir", label: "Ryan", style: "Energetic" }
];

const allowedVoiceValues = new Set(maleVoiceOptions.map((voice) => voice.value));

function loadStoredSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("onix-settings-v9")
      || localStorage.getItem("onix-settings-v8")
      || localStorage.getItem("onix-settings-v7")
      || localStorage.getItem("onix-settings-v6")
      || "{}"
    );
    return {
      ...defaultSettings,
      ...saved,
      voice: allowedVoiceValues.has(saved.voice) ? saved.voice : defaultSettings.voice
    };
  } catch {
    return defaultSettings;
  }
}

const acknowledgementWords = new Set([
  "yeah", "yes", "yep", "yup", "okay", "ok", "right", "sure", "no", "nope", "nah", "mhm", "uh-huh", "uh huh"
]);

function mergeTranscript(existing, incoming) {
  const current = String(existing || "").trim();
  const next = String(incoming || "").trim();
  if (!next) return current;
  if (!current) return next;
  if (next === current || current.endsWith(next)) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;

  const a = current.split(/\s+/);
  const b = next.split(/\s+/);
  const maxOverlap = Math.min(a.length, b.length, 10);
  for (let n = maxOverlap; n >= 1; n -= 1) {
    const left = a.slice(-n).join(" ").toLowerCase();
    const right = b.slice(0, n).join(" ").toLowerCase();
    if (left === right) return [...a, ...b.slice(n)].join(" ");
  }

  const joiner = /^[,.;:!?)]/.test(next) || next.startsWith("'") ? "" : " ";
  return `${current}${joiner}${next}`.replace(/\s+/g, " ").trim();
}

function cleanTranscript(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function isSimpleAcknowledgement(text) {
  const clean = String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return acknowledgementWords.has(clean);
}

function ThemeToggle({ theme, onToggle, compact = false }) {
  const dark = theme === "dark";
  return (
    <button
      className={`theme-toggle ${dark ? "is-dark" : "is-light"} ${compact ? "compact" : ""}`}
      onClick={onToggle}
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <img src={assetUrl("theme-toggle.png")} alt="" aria-hidden="true" />
      {!compact && <span>{dark ? "Dark" : "Light"}</span>}
    </button>
  );
}

function ScoreRing({ value = 0, label = "Overall" }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="score-ring-wrap">
      <div className="score-ring" style={{ "--score": `${safe * 3.6}deg` }}>
        <div className="score-ring-inner">
          <strong>{safe || "–"}</strong>
          <span>/100</span>
        </div>
      </div>
      <span className="score-ring-label">{label}</span>
    </div>
  );
}

function MiniScore({ label, value, icon: Icon }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mini-score">
      <div className="mini-score-head">
        <span><Icon size={16} /> {label}</span>
        <strong>{safe || "–"}</strong>
      </div>
      <div className="score-track"><span style={{ width: `${safe}%` }} /></div>
    </div>
  );
}

function CoachAvatar({ speaking, listening }) {
  return (
    <div className={`avatar-stage ${speaking ? "speaking" : ""} ${listening ? "listening" : ""}`}>
      <div className="ambient-blob blob-a" />
      <div className="ambient-blob blob-b" />
      <div className="avatar-aura aura-one" />
      <div className="avatar-aura aura-two" />
      <div className="voice-orbit orbit-one" />
      <div className="voice-orbit orbit-two" />
      <div className="tech-orbit tech-orbit-a"><i /></div>
      <div className="tech-orbit tech-orbit-b"><i /></div>
      <div className="spark spark-1" />
      <div className="spark spark-2" />
      <div className="spark spark-3" />

      <div
        className="coach-media-shell coach-illustration-shell coach-avatar-image-shell"
        aria-label="OniX AI animated male English coach"
      >
        <div className="onix-avatar-figure">
<img
  className="coach-avatar-image"
  src={assetUrl("onix-coach-avatar.png")}
  alt="OniX AI male English coach avatar"
  draggable="false"
/>

          <div className="onix-face-animation" aria-hidden="true">
            <span className="onix-animated-eye onix-animated-eye-left">
              <span className="onix-eye-iris">
                <span className="onix-eye-pupil" />
                <span className="onix-eye-glint" />
              </span>
              <span className="onix-eye-lid" />
            </span>

            <span className="onix-animated-eye onix-animated-eye-right">
              <span className="onix-eye-iris">
                <span className="onix-eye-pupil" />
                <span className="onix-eye-glint" />
              </span>
              <span className="onix-eye-lid" />
            </span>

            <span className="onix-speaking-mouth">
              <span className="onix-speaking-mouth-cover" />
              <span className="onix-speaking-mouth-shape">
                <span className="onix-speaking-tongue" />
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="coach-status-pill">
        <span className="status-dot" />
        {speaking ? "OniX is speaking" : listening ? "Listening to you" : "Ready to coach"}
      </div>
    </div>
  );
}


function SettingsModal({ settings, setSettings, theme, setTheme, sessionActive, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="settings-title-with-logo">
            src={assetUrl("logo2.png")}
            <div>
              <span className="eyebrow">One place for all preferences</span>
              <h2>OniX settings</h2>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        </div>

        <div className="theme-setting-row">
          <div>
            <strong>Appearance</strong>
            <span>Light mode is the default. Switch to dark mode whenever you prefer.</span>
          </div>
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
        </div>

        <div className="settings-grid">
          <label>
            <span>Your name</span>
            <input
              value={settings.learnerName}
              placeholder="e.g. Sathin"
              disabled={sessionActive}
              onChange={(e) => setSettings((s) => ({ ...s, learnerName: e.target.value }))}
            />
          </label>

          <label>
            <span>English level</span>
            <select disabled={sessionActive} value={settings.level} onChange={(e) => setSettings((s) => ({ ...s, level: e.target.value }))}>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </label>

          <label>
            <span>Correction style</span>
            <select disabled={sessionActive} value={settings.correctionMode} onChange={(e) => setSettings((s) => ({ ...s, correctionMode: e.target.value }))}>
              <option>Gentle</option>
              <option>Balanced</option>
              <option>Strict</option>
            </select>
          </label>

          <label>
            <span>Practice</span>
            <select disabled={sessionActive} value={settings.topic} onChange={(e) => setSettings((s) => ({ ...s, topic: e.target.value }))}>
              {topicOptions.map((topic) => <option key={topic}>{topic}</option>)}
            </select>
          </label>

          <label>
            <span>Speech recognition English</span>
            <select
              disabled={sessionActive}
              value={settings.locale}
              onChange={(e) => {
                const locale = e.target.value;
                const accent = locale === "en-GB" ? "British English" : locale === "en-IN" ? "South Asian / Indian English" : "American / International English";
                setSettings((s) => ({ ...s, locale, accent }));
              }}
            >
              <option value="en-US">International / US English</option>
              <option value="en-GB">British English</option>
              <option value="en-IN">South Asian English</option>
            </select>
          </label>

          <label>
            <span>OniX voice <small className="field-hint">Saved until you change it</small></span>
            <select disabled={sessionActive} value={settings.voice} onChange={(e) => {
              const voice = e.target.value;
              if (allowedVoiceValues.has(voice)) setSettings((s) => ({ ...s, voice }));
            }}>
              {maleVoiceOptions.map((voice) => (
                <option key={voice.value} value={voice.value}>{voice.label} — {voice.style}</option>
              ))}
            </select>
          </label>
        </div>

        {sessionActive && (
          <div className="modal-note">End the current conversation before changing voice, language, level, correction style, name or practice topic.</div>
        )}

        <button className="primary-btn full" onClick={onClose}><Check size={18} /> Save settings</button>
      </div>
    </div>
  );
}

function FeedbackView({ feedback, combinedScore, onReset }) {
  return (
    <section className="content-view feedback-view enter-view">
      <div className="feedback-hero glass-card">
        <div className="card-title-row">
          <div>
            <span className="eyebrow">Live feedback</span>
            <h2>Your speaking progress</h2>
          </div>
          <button className="icon-btn" onClick={onReset} aria-label="Reset feedback"><RotateCcw size={17} /></button>
        </div>

        <div className="feedback-hero-grid">
          <ScoreRing value={combinedScore} label="Overall" />
          <div className="score-copy large">
            <strong>{combinedScore >= 85 ? "Excellent work" : combinedScore >= 70 ? "Good progress" : combinedScore ? "Keep practising" : "Start speaking"}</strong>
            <span>{feedback?.summary || "Your latest grammar, vocabulary and clarity feedback will appear here while your conversation continues."}</span>
          </div>
        </div>
      </div>

      <div className="score-card-grid">
        <MiniScore label="Grammar" value={feedback?.grammarScore} icon={BookOpen} />
        <MiniScore label="Vocabulary" value={feedback?.vocabularyScore} icon={Languages} />
        <MiniScore label="Clarity" value={feedback?.clarityScore} icon={Gauge} />
        <MiniScore label="Overall English" value={feedback?.overallScore} icon={Headphones} />
      </div>

      <div className="insight-card glass-card">
        <div className="insight-icon"><Sparkles size={20} /></div>
        <div>
          <strong>Latest learning tip</strong>
          <p>{feedback?.vocabularyTip || "Speak naturally with OniX. Useful feedback is generated after complete English turns, while short answers such as “yes” and “no” stay part of the conversation without unnecessary scoring."}</p>
        </div>
      </div>
    </section>
  );
}

function CorrectionView({ feedback, analysisBusy }) {
  return (
    <section className="content-view correction-view enter-view">
      <div className="correction-page-card glass-card">
        <div className="card-title-row">
          <div>
            <span className="eyebrow">Instant correction</span>
            <h2>Grammar & natural English</h2>
          </div>
          {analysisBusy && <span className="analyzing"><i /> Analyzing…</span>}
        </div>

        {!feedback ? (
          <div className="empty-feedback large-empty">
            <WandSparkles size={32} />
            <h3>Speak naturally with OniX</h3>
            <p>After a complete sentence, OniX will show the important mistake, a short explanation, the corrected sentence and a more natural alternative when useful.</p>
          </div>
        ) : (
          <div className="correction-content-grid">
            <div>
              <div className="correction-box">
                <span>Correct version</span>
                <p>{feedback.correctedSentence}</p>
              </div>

              {feedback.naturalAlternative && feedback.naturalAlternative !== feedback.correctedSentence && (
                <div className="natural-box"><span>More natural</span><p>{feedback.naturalAlternative}</p></div>
              )}

              {feedback.vocabularyTip && <div className="tip-line"><Sparkles size={16} /> {feedback.vocabularyTip}</div>}
            </div>

            <div className="issue-list">
              {feedback.grammarIssues?.length ? feedback.grammarIssues.map((issue, index) => (
                <div className="issue-item" key={`${issue.part}-${index}`}>
                  <div className="issue-index">{index + 1}</div>
                  <div>
                    <strong>{issue.part}</strong>
                    <p>{issue.explanation}</p>
                    <small>Use: {issue.correction}</small>
                  </div>
                </div>
              )) : (
                <div className="all-good"><Check size={20} /> No important grammar mistake detected in the latest analysed turn.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [settings, setSettings] = useState(loadStoredSettings);

  const [theme, setTheme] = useState(() => localStorage.getItem("onix-theme-v9") || "light");
  const [activeView, setActiveView] = useState("coach");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionState, setSessionState] = useState("idle");
  const [muted, setMuted] = useState(false);
  const [coachSpeaking, setCoachSpeaking] = useState(false);
  const [coachCaption, setCoachCaption] = useState("Hi, I’m OniX, your English coach. Start a conversation when you’re ready.");
  const [userCaption, setUserCaption] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);
  const [notice, setNotice] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [transcriptionMode, setTranscriptionMode] = useState("starting");
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("onix-history") || "[]");
    } catch {
      return [];
    }
  });

  const liveRef = useRef(null);
  const coachPanelRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const speechActiveRef = useRef(false);
  const outputBufferRef = useRef("");
  const outputEndRef = useRef(0);
  const finalizeTurnTimerRef = useRef(null);
  const speakingTimerRef = useRef(null);
  const lastCommittedRef = useRef({ text: "", at: 0 });
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("onix-theme-v9", theme);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme === "dark" ? "#070b18" : "#f4f7ff");
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async () => {
      try {
        const response = await fetch(apiUrl("/api/health"), { cache: "no-store" });
        const data = await response.json();
        if (!cancelled) setApiHealth(data);
      } catch {
        if (!cancelled) setApiHealth({ ok: false, geminiConfigured: false, backendOffline: true });
      }
    };
    loadHealth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem("onix-settings-v9", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("onix-history", JSON.stringify(history.slice(0, 40)));
  }, [history]);

  useEffect(() => {
    if (sessionState !== "connected") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [sessionState]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === coachPanelRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("pseudo-fullscreen-open", pseudoFullscreen);
    return () => document.body.classList.remove("pseudo-fullscreen-open");
  }, [pseudoFullscreen]);

  useEffect(() => {
    return () => {
      liveRef.current?.close?.();
      window.clearTimeout(finalizeTurnTimerRef.current);
      window.clearTimeout(speakingTimerRef.current);
      window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  }, [seconds]);

  const combinedScore = useMemo(() => feedback?.overallScore ?? 0, [feedback]);
  const listening = sessionState === "connected" && !coachSpeaking && !muted;
  const fullscreenActive = isFullscreen || pseudoFullscreen;

  function showNotice(message, duration = 4200) {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) return;
    window.clearTimeout(noticeTimerRef.current);
    setNotice(cleanMessage);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), duration);
  }

  const viewMeta = {
    coach: { eyebrow: "AI-powered English speaking practice", title: "Talk naturally. Get corrected instantly." },
    feedback: { eyebrow: "Live learning insights", title: "See your English improve as you speak." },
    correction: { eyebrow: "Clear, useful corrections", title: "Understand the mistake. Say it better." }
  }[activeView] || { eyebrow: "OniX AI", title: "English speaking coach" };

  async function analyzeTurn(text) {
    const clean = cleanTranscript(text);
    if (!clean || clean.length < 2 || isSimpleAcknowledgement(clean)) return;

    setAnalysisBusy(true);
    try {
      const response = await fetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, level: settings.level })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const serviceError = new Error(data.message || "English feedback is temporarily unavailable.");
        serviceError.status = response.status;
        serviceError.code = data.code;
        throw serviceError;
      }
      setFeedback(data);
      setHistory((items) => [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          text: clean,
          corrected: data.correctedSentence,
          score: data.overallScore
        },
        ...items
      ].slice(0, 40));
    } catch (err) {
      showNotice(friendlyServiceMessage(err, "English feedback is temporarily unavailable. Keep talking—your conversation can continue."), 5000);
    } finally {
      setAnalysisBusy(false);
    }
  }

  function commitUserTurn() {
    window.clearTimeout(finalizeTurnTimerRef.current);
    const raw = finalTranscriptRef.current || interimTranscriptRef.current;
    const clean = cleanTranscript(raw);
    if (!clean) return;

    const now = Date.now();
    if (lastCommittedRef.current.text === clean && now - lastCommittedRef.current.at < 2500) return;
    lastCommittedRef.current = { text: clean, at: now };

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setUserCaption(clean);
    analyzeTurn(clean);
  }

  function scheduleCommit(delay = 120) {
    window.clearTimeout(finalizeTurnTimerRef.current);
    finalizeTurnTimerRef.current = window.setTimeout(commitUserTurn, delay);
  }

  function handleLiveEvent(event) {
    if (event.type === "user.activity.start") {
      speechActiveRef.current = true;
      finalTranscriptRef.current = "";
      interimTranscriptRef.current = "";
      window.clearTimeout(finalizeTurnTimerRef.current);
    }

    if (event.type === "user.activity.end") {
      speechActiveRef.current = false;
      // Give the dedicated transcriber only a very small window to deliver its
      // authoritative final segment. No long 650 ms frontend wait anymore.
      scheduleCommit(260);
    }

    if (event.type === "session.input_transcript.interim") {
      interimTranscriptRef.current = cleanTranscript(event.text);
      if (interimTranscriptRef.current) setUserCaption(interimTranscriptRef.current);
    }

    if (event.type === "session.input_transcript.final") {
      finalTranscriptRef.current = mergeTranscript(finalTranscriptRef.current, event.text);
      const preview = cleanTranscript(finalTranscriptRef.current);
      if (preview) setUserCaption(preview);
      if (!speechActiveRef.current) scheduleCommit(60);
    }

    if (event.type === "transcription.ready") {
      setTranscriptionMode("precision");
      setNotice("");
    }

    if (event.type === "transcription.degraded") {
      setTranscriptionMode("native");
      showNotice("OniX is using its standard live transcript while high-accuracy transcription reconnects.", 4200);
    }

    if (event.type === "session.output_transcript.delta") {
      const now = event.at || Date.now();
      if (now - outputEndRef.current > 1100) outputBufferRef.current = "";
      outputBufferRef.current = mergeTranscript(outputBufferRef.current, event.delta || "");
      outputEndRef.current = now;
      if (outputBufferRef.current.trim()) setCoachCaption(outputBufferRef.current.trim());
      setCoachSpeaking(true);
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = window.setTimeout(() => setCoachSpeaking(false), 600);
    }

    if (event.type === "session.turn.complete") {
      if (!speechActiveRef.current && finalTranscriptRef.current.trim()) scheduleCommit(50);
    }

    if (event.type === "service.notice") {
      showNotice(event.message || "OniX had a brief connection interruption.", 4500);
    }

    if (event.type === "error") {
      showNotice(friendlyServiceMessage(event.error, "OniX had a brief connection interruption. Please try again if the session stops."), 4500);
    }

    if (event.type === "session.closed") {
      setSessionState("idle");
      setCoachSpeaking(false);
      showNotice("The live connection ended. Press Start conversation to reconnect.", 5000);
    }
  }

  async function startCoach() {
    if (sessionState === "connecting" || sessionState === "connected") return;

    setNotice("");
    setTranscriptionMode("starting");
    setSessionState("connecting");
    setSeconds(0);
    setMuted(false);
    setUserCaption("");
    setCoachCaption("Connecting to OniX…");
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    speechActiveRef.current = false;
    outputBufferRef.current = "";
    outputEndRef.current = 0;

    try {
      let health = apiHealth;
      try {
        const healthResponse = await fetch(apiUrl("/api/health"), { cache: "no-store" });
        health = await healthResponse.json();
        setApiHealth(health);
      } catch {
        throw new Error("OniX could not reach the local service. Please make sure the app server is running and try again.");
      }

      if (!health?.geminiConfigured) {
        throw new Error("OniX AI is not configured yet. Check the Gemini API key and restart the app server.");
      }

      const sessionSettings = {
        ...settings,
        voice: allowedVoiceValues.has(settings.voice) ? settings.voice : defaultSettings.voice
      };
      const live = await createLiveCoach({
        settings: sessionSettings,
        onEvent: handleLiveEvent,
        onState: (state) => {
          if (state === "connected") {
            setSessionState("connected");
            setCoachCaption("OniX is starting your session…");
          }
          if (state === "coach-speaking") setCoachSpeaking(true);
          if (state === "listening") setCoachSpeaking(false);
          if (["failed", "disconnected", "error", "closed"].includes(state)) setSessionState("idle");
        }
      });
      liveRef.current = live;
      setTranscriptionMode(live.transcriptionMode || "native");
    } catch (err) {
      const message = friendlyServiceMessage(err, "OniX could not start the conversation right now. Please try again in a moment.");
      setSessionState("idle");
      setCoachCaption("OniX is ready. Please try starting the conversation again.");
      showNotice(message, 5500);
    }
  }

  function stopCoach() {
    liveRef.current?.close?.();
    liveRef.current = null;
    speechActiveRef.current = false;
    window.clearTimeout(finalizeTurnTimerRef.current);
    setSessionState("idle");
    setCoachSpeaking(false);
    setMuted(false);
    setCoachCaption("Session ended. Review your feedback, or start another conversation when you're ready.");
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    liveRef.current?.mute?.(next);
  }

  function resetFeedback() {
    setFeedback(null);
    setUserCaption("");
  }

  async function toggleFullscreen() {
    const element = coachPanelRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (element.requestFullscreen) {
        await element.requestFullscreen();
        return;
      }
      setPseudoFullscreen((value) => !value);
    } catch {
      setPseudoFullscreen((value) => !value);
    }
  }

  function navButton(view, label, Icon) {
    return (
      <button
        className={`nav-item ${activeView === view ? "active" : ""}`}
        onClick={() => setActiveView(view)}
        type="button"
      >
        <Icon size={19} /> <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="app-shell">
      <div className="page-glow glow-one" />
      <div className="page-glow glow-two" />

      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo-full" src={assetUrl("logo.png")} alt="OniX AI" draggable="false" />
        </div>

        <nav>
          {navButton("coach", "Live Coach", Sparkles)}
          {navButton("feedback", "Live Feedback", Activity)}
          {navButton("correction", "Instant Correction", WandSparkles)}
          <button className="nav-item" onClick={() => setShowHistory(true)} type="button"><History size={19} /><span>Practice History</span></button>
          <button className="nav-item settings-nav" onClick={() => setShowSettings(true)} type="button"><Settings size={19} /><span>Settings</span></button>
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-icon"><Target size={18} /></div>
          <span>Current level</span>
          <strong>{settings.level}</strong>
          <small>{settings.topic}</small>
        </div>

        <div className="sidebar-bottom">
          <img className="sidebar-service-logo" src="/assets/logo2.png" alt="" aria-hidden="true" />
          <span className={`service-dot ${apiHealth?.geminiConfigured ? "online" : ""}`} />
          <div>
            <strong>OniX Speech AI</strong>
            <small>{apiHealth?.geminiConfigured ? "Voice coaching ready" : "API key required"}</small>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-copy">
            <div className="mobile-brand-line">
              <img src="/assets/logo2.png" alt="OniX AI" />
              <span>OniX AI</span>
            </div>
            <span className="eyebrow">{viewMeta.eyebrow}</span>
            <h1>{viewMeta.title}</h1>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} compact />
            <div className={`connection-badge ${sessionState}`}>
              <span /> {sessionState === "connected" ? "Live" : sessionState === "connecting" ? "Connecting" : "Offline"}
            </div>
          </div>
        </header>

        {activeView === "coach" && (
          <section className="content-view coach-view enter-view">
            <div ref={coachPanelRef} className={`coach-panel glass-card ${pseudoFullscreen ? "pseudo-fullscreen" : ""}`}>
              <div className="coach-panel-top">
                <div className="coach-name">
                  <div className="coach-mini-avatar"><img src="/assets/logo2.png" alt="" aria-hidden="true" /></div>
                  <div><strong>OniX</strong><span>AI English Coach</span></div>
                </div>
                <div className="coach-top-actions">
                  <div className={`transcription-pill ${transcriptionMode}`}>
                    <span /> {transcriptionMode === "precision" ? "English transcript ready" : transcriptionMode === "starting" ? "Preparing speech" : "Live transcript"}
                  </div>
                  <div className="session-time"><Activity size={16} /> {formattedTime}</div>
                  <button className="icon-btn fullscreen-btn" onClick={toggleFullscreen} aria-label={fullscreenActive ? "Exit full screen" : "Open full screen"}>
                    {fullscreenActive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                </div>
              </div>

              <CoachAvatar speaking={coachSpeaking} listening={listening} />

              <div className="captions-zone">
                <div className="caption-card coach-caption">
                  <span className="speaker-label"><Volume2 size={14} /> OniX</span>
                  <p>{coachCaption}</p>
                </div>
              </div>

              {notice && <div className="notice-banner">{notice}</div>}

              <div className="controls-dock">
                {sessionState !== "connected" ? (
                  <button className="start-call-btn" disabled={sessionState === "connecting"} onClick={startCoach}>
                    <img src={assetUrl("start-conversation.png")} alt="" aria-hidden="true" />
                    <span>{sessionState === "connecting" ? "Connecting…" : "Start conversation"}</span>
                  </button>
                ) : (
                  <div className="live-controls">
                    <button className={`round-control ${muted ? "danger-soft" : ""}`} onClick={toggleMute} title={muted ? "Unmute microphone" : "Mute microphone"}>
                      {muted ? <MicOff size={23} /> : <Mic size={23} />}
                    </button>
                    <div className="live-wave" aria-hidden="true">{[1,2,3,4,5,6,7,8,9].map((n) => <i key={n} />)}</div>
                    <button className="round-control end" onClick={stopCoach} title="End conversation"><CircleStop size={23} /></button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeView === "feedback" && <FeedbackView feedback={feedback} combinedScore={combinedScore} onReset={resetFeedback} />}
        {activeView === "correction" && <CorrectionView feedback={feedback} analysisBusy={analysisBusy} />}
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          setSettings={setSettings}
          theme={theme}
          setTheme={setTheme}
          sessionActive={sessionState === "connected" || sessionState === "connecting"}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHistory && (
        <div className="modal-backdrop" onMouseDown={() => setShowHistory(false)}>
          <div className="history-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div><span className="eyebrow">Recent practice</span><h2>Speaking history</h2></div>
              <button className="icon-btn" onClick={() => setShowHistory(false)}><X size={20} /></button>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="empty-history">Your analysed speaking turns will appear here.</div>
              ) : history.map((item) => (
                <div className="history-item" key={item.id}>
                  <div className="history-score">{item.score}</div>
                  <div className="history-copy">
                    <span>{new Date(item.at).toLocaleString()}</span>
                    <p>“{item.text}”</p>
                    {item.corrected && item.corrected !== item.text && <small>Corrected: {item.corrected}</small>}
                  </div>
                </div>
              ))}
            </div>
            {history.length > 0 && <button className="secondary-btn full" onClick={() => setHistory([])}>Clear history</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
