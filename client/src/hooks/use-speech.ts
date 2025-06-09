/* client/src/hooks/use-speech.ts */
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isRecognitionSupported: boolean;
  isSupported?: boolean;            // legacy alias
  isSynthesisSupported: boolean;
  startListening: (onResult: (t: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void;
  cancelSpeak: () => void;
  recognitionError: string | null;
  synthesisError: string | null;
}

export function useSpeech(): UseSpeechReturn {
  /* ────────────── state ───────────── */
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  /* ────────────── refs ───────────── */
  const recRef  = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const uttRef   = useRef<SpeechSynthesisUtterance | null>(null);

  /* ───── feature detection ───── */
  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  /* ───── init helpers ───── */
  const initRecognition = useCallback((): SpeechRecognition | null => {
    if (!isRecognitionSupported) return null;
    const Impl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new Impl();
    rec.continuous     = false;   // single utterance
    rec.interimResults = false;   // only final result
    rec.lang           = "en-US";
    return rec;
  }, [isRecognitionSupported]);

  const initSynthesis = useCallback((): SpeechSynthesis | null => {
    if (!isSynthesisSupported) return null;
    return window.speechSynthesis;
  }, [isSynthesisSupported]);

  const fullyStopRecognition = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      rec.onstart = rec.onend = rec.onresult = rec.onerror = null;
      try { rec.stop(); } catch {/* ignore */}
    }
    recRef.current = null;
    setIsListening(false);
  }, []);

  /* ─────────── start / stop ─────────── */
  const startListening = useCallback(
    async (onResult: (t: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition isn’t supported in this browser.");
        return;
      }
      if (isListening) { fullyStopRecognition(); return; }

      /* 1. prime the mic (Windows quirk) */
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop()); // close immediately
        }
      } catch (err: any) {
        setRecognitionError("Microphone permission denied.");
        return;
      }

      /* 2. init recogniser */
      const rec = initRecognition();
      if (!rec) {
        setRecognitionError("Could not initialise speech engine.");
        return;
      }
      recRef.current = rec;
      setRecognitionError(null);

      rec.onstart = () => setIsListening(true);

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const res = e.results[e.results.length - 1];
        if (!res.isFinal) return;
        const text = res[0].transcript.trim();
        if (text) onResult(text);
        fullyStopRecognition();                 // <── stop immediately (iOS fix)
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn("[Speech] error:", e.error);
        if (e.error !== "no-speech" && e.error !== "aborted") {
          setRecognitionError(`Voice error: ${e.error}`);
        }
        fullyStopRecognition();
      };

      rec.onend = fullyStopRecognition;        // safety net

      try { rec.start(); }
      catch (err: any) {
        setRecognitionError(`Failed to start: ${err.message}`);
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, isListening, initRecognition, fullyStopRecognition]
  );

  const stopListening = useCallback(() => fullyStopRecognition(), [fullyStopRecognition]);

  /* ─────────── synthesis ─────────── */
  useEffect(() => {
    if (!synthRef.current && isSynthesisSupported) synthRef.current = initSynthesis();
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback(
    (text: string, rate = 1.05) => {
      if (!isSynthesisSupported) {
        setSynthesisError("Speech synthesis isn’t supported here.");
        return;
      }
      if (!synthRef.current) synthRef.current = initSynthesis();
      const synth = synthRef.current!;

      if (synth.speaking) synth.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = rate; utt.pitch = 1.1; utt.volume = 0.8;
      utt.onstart = () => setIsSpeaking(true);
      utt.onend   = () => setIsSpeaking(false);
      utt.onerror = e => { setSynthesisError(`TTS error: ${e.error}`); setIsSpeaking(false); };

      uttRef.current = utt;
      synth.speak(utt);
    },
    [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
    setIsSpeaking(false);
  }, []);

  /* ─────────── cleanup ─────────── */
  useEffect(() => () => {
    fullyStopRecognition();
    synthRef.current?.cancel();
  }, [fullyStopRecognition]);

  /* ─────────── export ─────────── */
  return {
    isListening,
    isSpeaking,
    isRecognitionSupported,
    isSupported: isRecognitionSupported,
    isSynthesisSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    recognitionError,
    synthesisError,
  };
}
