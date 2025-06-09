/* client/src/hooks/use-speech.ts
 * Speech-in / Speech-out hook that works everywhere.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────── types ─────────── */
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

/* ─────────── hook ─────────── */
export function useSpeech(): UseSpeechReturn {
  /* ---------------- state ---------------- */
  const [isListening, setIsListening]   = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [recognitionError, setRecErr]   = useState<string | null>(null);
  const [synthesisError, setSynthErr]   = useState<string | null>(null);

  /* ---------------- refs ---------------- */
  const recRef   = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const uttRef   = useRef<SpeechSynthesisUtterance | null>(null);

  /* ------------- feature detection ------------- */
  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  /* ------------- helpers / init ------------- */
  const initRecognition = useCallback((): SpeechRecognition | null => {
    if (!isRecognitionSupported) return null;
    const Impl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new Impl();
    rec.continuous     = false;   // single utterance
    rec.interimResults = false;   // only final transcript
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
      try { rec.stop(); } catch { /* ignore */ }
    }
    recRef.current = null;
    setIsListening(false);
  }, []);

  /* ------------- start / stop listening ------------- */
  const startListening = useCallback(
    async (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecErr("Speech recognition isn’t supported in this browser.");
        return;
      }

      /* SECOND CLICK WHILE LISTENING → finalise current utterance */
      if (isListening) {
        if (recRef.current) {
          try { recRef.current.stop(); } catch { /* ignore */ }
        }
        return; // wait for onresult/onend to fire
      }

      /* 1. Prime the mic (Windows / Chrome quirk) */
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop()); // close immediately
        }
      } catch {
        setRecErr("Microphone permission denied.");
        return;
      }

      /* 2. Set up recogniser */
      const rec = initRecognition();
      if (!rec) {
        setRecErr("Could not initialise speech engine.");
        return;
      }
      recRef.current = rec;
      setRecErr(null);

      rec.onstart = () => setIsListening(true);

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const res = e.results[e.results.length - 1];
        if (!res.isFinal) return;
        const text = res[0].transcript.trim();
        if (text) onResult(text);
        fullyStopRecognition();          // close mic immediately
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn("[Speech] error:", e.error);
        if (e.error !== "no-speech" && e.error !== "aborted") {
          setRecErr(`Voice error: ${e.error}`);
        }
        fullyStopRecognition();
      };

      rec.onend = fullyStopRecognition; // safety

      try { rec.start(); }
      catch (err: any) {
        setRecErr(`Failed to start: ${err.message}`);
        fullyStopRecognition();
      }
    },
    [
      isRecognitionSupported,
      isListening,
      initRecognition,
      fullyStopRecognition,
    ]
  );

  const stopListening = useCallback(() => fullyStopRecognition(), [fullyStopRecognition]);

  /* ------------- speech synthesis ------------- */
  useEffect(() => {
    if (!synthRef.current && isSynthesisSupported) {
      synthRef.current = initSynthesis();
    }
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback(
    (text: string, rate = 1.05) => {
      if (!isSynthesisSupported) {
        setSynthErr("Speech synthesis isn’t supported here.");
        return;
      }
      if (!synthRef.current) synthRef.current = initSynthesis();
      const synth = synthRef.current!;

      if (synth.speaking) synth.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = rate; utt.pitch = 1.1; utt.volume = 0.8;
      utt.onstart = () => setIsSpeaking(true);
      utt.onend   = () => setIsSpeaking(false);
      utt.onerror = e => { setSynthErr(`TTS error: ${e.error}`); setIsSpeaking(false); };

      uttRef.current = utt;
      synth.speak(utt);
    },
    [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
    setIsSpeaking(false);
  }, []);

  /* ------------- cleanup on unmount ------------- */
  useEffect(() => () => {
    fullyStopRecognition();
    synthRef.current?.cancel();
  }, [fullyStopRecognition]);

  /* ------------- export api ------------- */
  return {
    isListening,
    isSpeaking,
    isRecognitionSupported,
    isSupported: isRecognitionSupported, // legacy alias
    isSynthesisSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    recognitionError: recognitionError,
    synthesisError: synthesisError,
  };
}
