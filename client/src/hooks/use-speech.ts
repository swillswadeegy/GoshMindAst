/* client/src/hooks/use-speech.ts */
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isRecognitionSupported: boolean;
  /** LEGACY alias so existing components keep working */
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
  /* --------------------------------------------------------------------
   * 1. STATE
   * ------------------------------------------------------------------ */
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  /* --------------------------------------------------------------------
   * 2. REFS
   * ------------------------------------------------------------------ */
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef   = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  /* --------------------------------------------------------------------
   * 3. FEATURE DETECTION
   * ------------------------------------------------------------------ */
  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  /* --------------------------------------------------------------------
   * 4. HELPERS
   * ------------------------------------------------------------------ */
  const initRecognition = useCallback((): SpeechRecognition | null => {
    if (!isRecognitionSupported) return null;
    const Impl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new Impl();

    rec.continuous = true;
    rec.interimResults = true;
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

  /* --------------------------------------------------------------------
   * 5. START / STOP LISTENING
   * ------------------------------------------------------------------ */
  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in this browser.");
        return;
      }

      if (isListening) {
        fullyStopRecognition();   // toggle off
        return;
      }

      const rec = initRecognition();
      if (!rec) {
        setRecognitionError("Could not initialise the speech-recognition engine.");
        return;
      }

      recognitionRef.current = rec;
      setRecognitionError(null);

      rec.onstart = () => {
        setIsListening(true);
        console.log("[Speech] 🎤  Mic activated");
      };

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const transcript = e.results[e.results.length - 1][0].transcript.trim();
        console.log("[Speech] ✍️  Transcript:", transcript);
        if (transcript) onResult(transcript);
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn("[Speech] ⚠️  Error:", e.error);
        if (e.error !== "aborted" && e.error !== "no-speech") {
          setRecognitionError(`Voice recognition error: ${e.error}`);
        }
        fullyStopRecognition();
      };

      rec.onend = () => {
        console.log("[Speech] 🛑  onend fired");
        if (isListening) {
          try { rec.start(); } catch { fullyStopRecognition(); }
        }
      };

      try { rec.start(); }
      catch (err: any) {
        console.error("[Speech] Could not start recognition:", err);
        setRecognitionError("Failed to start voice recognition.");
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, isListening, initRecognition, fullyStopRecognition]
  );

  const stopListening = useCallback(() => {
    fullyStopRecognition();
  }, [fullyStopRecognition]);

  /* --------------------------------------------------------------------
   * 6. SPEECH SYNTHESIS
   * ------------------------------------------------------------------ */
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
        console.error("[Speech] TTS error:", e.error);
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

  /* --------------------------------------------------------------------
   * 7. CLEAN-UP ON UNMOUNT
   * ------------------------------------------------------------------ */
  useEffect(() => {
    return () => {
      fullyStopRecognition();
      synthesisRef.current?.cancel();
    };
  }, [fullyStopRecognition]);

  /* --------------------------------------------------------------------
   * 8. EXPORT
   * ------------------------------------------------------------------ */
  return {
    isListening,
    isSpeaking,
    isRecognitionSupported,
    isSupported: isRecognitionSupported, // <-- legacy alias
    isSynthesisSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    recognitionError,
    synthesisError,
  };
}
