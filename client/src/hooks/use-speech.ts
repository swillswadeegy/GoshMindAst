/* client/src/hooks/use-speech.ts
 * Only send transcript after the browser marks it FINAL
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isRecognitionSupported: boolean;
  /** legacy alias for UI code that still expects it */
  isSupported?: boolean;
  isSynthesisSupported: boolean;
  startListening: (onResult: (transcript: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void;
  cancelSpeak: () => void;
  recognitionError: string | null;
  synthesisError: string | null;
}

export function useSpeech(): UseSpeechReturn {
  /* ───────────────────────────── STATE ───────────────────────────── */
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  /* ───────────────────────────── REFS ────────────────────────────── */
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef   = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  /* ───────────────────── FEATURE DETECTION ───────────────────────── */
  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  /* ─────────────────────── HELPERS / INIT ───────────────────────── */
  const initRecognition = useCallback((): SpeechRecognition | null => {
    if (!isRecognitionSupported) return null;
    const Impl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new Impl();

    rec.continuous = true;     // keep mic open for new utterances
    rec.interimResults = false; // **key change** → only final results delivered
    rec.lang = "en-US";
    return rec;
  }, [isRecognitionSupported]);

  const initSynthesis = useCallback((): SpeechSynthesis | null => {
    if (!isSynthesisSupported) return null;
    return window.speechSynthesis;
  }, [isSynthesisSupported]);

  const fullyStopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      rec.onstart = rec.onend = rec.onresult = rec.onerror = null;
      try { rec.stop(); } catch {}
    }
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  /* ───────────────────── LISTEN / STOP HOOK API ──────────────────── */
  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in this browser.");
        return;
      }

      if (isListening) {          // toggle ↔ stop
        fullyStopRecognition();
        return;
      }

      const rec = initRecognition();
      if (!rec) {
        setRecognitionError("Could not initialise the speech-recognition engine.");
        return;
      }

      recognitionRef.current = rec;
      setRecognitionError(null);

      rec.onstart = () => { setIsListening(true); };

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const result = e.results[e.results.length - 1];
        if (!result.isFinal) return;

        const transcript = result[0].transcript.trim();
        if (transcript) onResult(transcript);

-       /* (nothing here before) */
+       fullyStopRecognition();          // 🔈← NEW → closes mic immediately
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error !== "aborted" && e.error !== "no-speech") {
          setRecognitionError(`Voice recognition error: ${e.error}`);
        }
        fullyStopRecognition();
      };

      rec.onend = () => {
        // Chrome fires onend after a few seconds of silence.
        // If user hasn’t manually stopped, auto-restart so button keeps glowing.
        if (isListening) {
          try { rec.start(); } catch { fullyStopRecognition(); }
        }
      };

      try { rec.start(); }
      catch (err: any) {
        setRecognitionError("Failed to start voice recognition.");
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, isListening, initRecognition, fullyStopRecognition]
  );

  const stopListening = useCallback(() => { fullyStopRecognition(); }, [fullyStopRecognition]);

  /* ─────────────────────── SPEECH-SYNTHESIS ─────────────────────── */
  useEffect(() => {
    if (!synthesisRef.current && isSynthesisSupported) {
      synthesisRef.current = initSynthesis();
    }
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback(
    (text: string, rate: number = 1.05) => {
      if (!isSynthesisSupported) {
        setSynthesisError("Speech synthesis is not supported in this browser.");
        return;
      }
      if (!synthesisRef.current) synthesisRef.current = initSynthesis();

      const synth = synthesisRef.current!;
      if (synth.speaking) synth.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      utt.rate   = rate;
      utt.pitch  = 1.1;
      utt.volume = 0.8;

      utt.onstart = () => setIsSpeaking(true);
      utt.onend   = () => setIsSpeaking(false);
      utt.onerror = (e: SpeechSynthesisErrorEvent) => {
        setSynthesisError(`TTS error: ${e.error}`);
        setIsSpeaking(false);
      };

      currentUtteranceRef.current = utt;
      synth.speak(utt);
    },
    [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current?.speaking) {
      synthesisRef.current.cancel();
    }
    setIsSpeaking(false);
  }, []);

  /* ───────────────────────── CLEAN-UP ────────────────────────────── */
  useEffect(() => {
    return () => {
      fullyStopRecognition();
      synthesisRef.current?.cancel();
    };
  }, [fullyStopRecognition]);

  /* ─────────────────────────── EXPORT ────────────────────────────── */
  return {
    isListening,
    isSpeaking,
    isRecognitionSupported,
    isSupported: isRecognitionSupported,   // legacy alias
    isSynthesisSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    recognitionError,
    synthesisError,
  };
}
