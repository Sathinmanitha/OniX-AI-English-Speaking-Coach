import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
}

function extractWordDetails(rawJson) {
  try {
    const parsed = JSON.parse(rawJson || "{}");
    const words = parsed?.NBest?.[0]?.Words || [];
    return words.map((item) => ({
      word: item.Word || "",
      accuracyScore: safeNumber(item?.PronunciationAssessment?.AccuracyScore),
      errorType: item?.PronunciationAssessment?.ErrorType || "None",
      phonemes: (item.Phonemes || []).map((phoneme) => ({
        phoneme: phoneme.Phoneme || "",
        accuracyScore: safeNumber(phoneme?.PronunciationAssessment?.AccuracyScore)
      }))
    }));
  } catch {
    return [];
  }
}

export async function startPronunciationAssessment({ locale = "en-US", onResult, onStatus }) {
  const tokenResponse = await fetch("/api/speech/token");
  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(tokenData.error || "Unable to connect to pronunciation service.");
  }

  if (!tokenData.enabled) {
    onStatus?.("disabled");
    return null;
  }

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenData.token, tokenData.region);
  speechConfig.speechRecognitionLanguage = locale;
  speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
    "",
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true
  );

  pronunciationConfig.phonemeAlphabet = "IPA";
  if (locale === "en-US") pronunciationConfig.enableProsodyAssessment();
  pronunciationConfig.applyTo(recognizer);

  recognizer.recognized = (_, event) => {
    if (event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech || !event.result.text) return;

    const assessment = SpeechSDK.PronunciationAssessmentResult.fromResult(event.result);
    const raw = event.result.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
    const words = extractWordDetails(raw);

    onResult?.({
      text: event.result.text,
      pronunciationScore: safeNumber(assessment.pronunciationScore),
      accuracyScore: safeNumber(assessment.accuracyScore),
      fluencyScore: safeNumber(assessment.fluencyScore),
      completenessScore: safeNumber(assessment.completenessScore),
      prosodyScore: safeNumber(assessment.prosodyScore),
      words
    });
  };

  recognizer.canceled = (_, event) => {
    if (event.reason === SpeechSDK.CancellationReason.Error) {
      onStatus?.("error", event.errorDetails);
    }
  };

  recognizer.sessionStarted = () => onStatus?.("active");
  recognizer.sessionStopped = () => onStatus?.("stopped");

  recognizer.startContinuousRecognitionAsync();

  return {
    stop() {
      recognizer.stopContinuousRecognitionAsync(() => {
        recognizer.close();
        audioConfig.close();
        speechConfig.close();
      });
    }
  };
}
