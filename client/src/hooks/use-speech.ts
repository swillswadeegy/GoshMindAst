/* client/src/hooks/use-speech.ts
 * Works the same everywhere (Windows, macOS, iOS, Android)
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
  /* ──────────────── state ──────────────── */
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  /* ──────────────── refs ──────────────── */
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef   = useRef<SpeechSynthesis | null>(null);
  const currentUttRef  = useRef<SpeechSynthesisUtterance | null>(null);

  /* ───────── feature detection ───────── */
  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  /* ─────────── helpers / init ─────────── */
  const initRecognition = useCallback((): SpeechRecognition | null => {
    if (!isRecognitionSupported) return null;
    const Impl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new Impl();

    rec.continuous = false;      // ← critical for Windows
    rec.interimResults = false;  // deliver only final result
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
      try { rec.stop(); } catch { /* ignore */ }
    }
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  /* ─────────── listen / stop api ─────────── */
  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in this browser.");
        return;
      }

      /* toggle off if already listening */
      if (isListening) {
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

      rec.onstart = () => setIsListening(true);

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const res = e.results[e.results.length - 1];
        if (!res.isFinal) return;

        const transcript = res[0].transcript.trim();
        if (transcript) onResult(transcript);
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn("[Speech] error:", e.error);
        /* benign errors on Windows we simply swallow */
        if (e.error !== "no-speech" && e.error !== "aborted") {
          setRecognitionError(`Voice recognition error: ${e.error}`);
        }
      };

      rec.onend = () => {
        /* always tidy up UI */
        fullyStopRecognition();
        /* If you want to auto-restart after “no-speech” you can
           uncomment the lines below. By default we require the user
           to click again, which avoids the Windows bug loop. */
        // if (!recognitionError) {
        //   startListening(onResult);
        // }
      };

      try { rec.start(); }
      catch (err: any) {
        setRecognitionError(`Failed to start voice recognition: ${err.message}`);
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, isListening, initRecognition, fullyStopRecognition]
  );

  const stopListening = useCallback(() => fullyStopRecognition(), [fullyStopRecognition]);

  /* ─────────── speech-synthesis ─────────── */
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

      currentUttRef.current = utt;
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

  /* ─────────── cleanup on unmount ─────────── */
  useEffect(() => {
    return () => {
      fullyStopRecognition();
      synthesisRef.current?.cancel();
    };
  }, [fullyStopRecognition]);

  /* ─────────── export api ─────────── */
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
    recognitionError,
    synthesisError,
  };
}
