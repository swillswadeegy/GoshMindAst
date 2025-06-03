import { useState, useRef, useCallback, useEffect } from "react";

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isRecognitionSupported: boolean;
  isSynthesisSupported: boolean;
  startListening: (onResult: (transcript: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void;
  cancelSpeak: () => void;
  recognitionError: string | null;
  synthesisError: string | null;
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const initRecognition = useCallback(() => {
    if (!isRecognitionSupported || typeof window === "undefined") return null;
    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    return recognition;
  }, [isRecognitionSupported]);

  const fullyStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      // console.log("[useSpeech] fullyStopRecognition called.");
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onspeechend = null;
      recognitionRef.current.abort(); 
      recognitionRef.current = null;
    }
    if (isListening) {
        setIsListening(false);
    }
  }, [isListening]);

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      console.log("[useSpeech] startListening called.");
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported.");
        return;
      }

      // If a recognition is already genuinely in a listening state, stop it.
      // This is primarily for user-initiated double clicks.
      if (isListening && recognitionRef.current) {
        console.log("[useSpeech] startListening: was already listening, stopping previous.");
        fullyStopRecognition();
        // Do not immediately restart; let the user click again if they meant to restart.
        // This avoids potential loops if state updates are tricky.
        return; 
      }
      
      // If not listening, or if ref was cleaned up, proceed.
      // Ensure any old ref is definitely cleared if isListening was somehow false but ref existed.
      if (recognitionRef.current) {
        console.log("[useSpeech] startListening: Found existing recognitionRef but wasn't 'isListening'. Cleaning up before new session.");
        fullyStopRecognition(); // Clean up just in case
      }

      const recognition = initRecognition();
      if (!recognition) {
        setRecognitionError("Could not initialize speech recognition instance.");
        return;
      }

      recognitionRef.current = recognition;
      setRecognitionError(null);

      recognition.onstart = () => {
        setIsListening(true);
        console.log("[useSpeech] Event: onstart - Mic active.");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const speechResult = event.results[event.results.length - 1];
        const transcript = speechResult[0].transcript;
        console.log(`[useSpeech] Event: onresult - Transcript: "${transcript}"`);
        if (transcript.trim()) {
          onResult(transcript);
        }
        // NO EXPLICIT STOP/ABORT HERE.
        // Rely on continuous=false for the browser to end speech and fire onspeechend/onend.
      };

      recognition.onspeechend = () => {
        // This event indicates the user has stopped speaking.
        console.log("[useSpeech] Event: onspeechend - User stopped speaking.");
        // We don't call stop() here anymore either. We wait for onend.
        // If onend doesn't fire after this, that's the core issue for mic indicator.
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn(`[useSpeech] Event: onerror - Error: ${event.error}, Message: ${event.message}`);
        if (event.error === 'aborted') {
          // This can happen if fullyStopRecognition is called (e.g. by stopListening, or unmount)
          // while recognition was starting or active.
          // We already call fullyStopRecognition below, so just log.
        } else if (event.error === 'no-speech') {
          // No error message to UI for this, but still stop.
        } else {
          setRecognitionError(`Voice recognition error: ${event.error}`);
        }
        fullyStopRecognition();
      };

      recognition.onend = () => {
        console.log("[useSpeech] Event: onend - Recognition session formally ended.");
        fullyStopRecognition(); 
      };

      try {
        console.log("[useSpeech] Attempting recognition.start()");
        recognition.start();
      } catch (err: any) {
        console.error('[useSpeech] Exception during recognition.start():', err);
        setRecognitionError(`Failed to start voice recognition: ${err.message}`);
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening]
  );

  const stopListening = useCallback(() => {
    console.log("[useSpeech] Manual stopListening called.");
    fullyStopRecognition();
  }, [fullyStopRecognition]);

  // --- Speech Synthesis (Output) Logic --- (Kept as is from your last working version)
  const initSynthesis = useCallback(() => {
    if (!isSynthesisSupported || typeof window === "undefined") return null;
    return window.speechSynthesis;
  }, [isSynthesisSupported]);

  useEffect(() => {
    if (!synthesisRef.current && isSynthesisSupported) {
      synthesisRef.current = initSynthesis();
    }
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback(
    (text: string, rate: number = 1.05) => {
      if (!synthesisRef.current) {
        if (isSynthesisSupported) {
            synthesisRef.current = initSynthesis();
            if(!synthesisRef.current) {
                setSynthesisError("Speech synthesis could not be initialized."); return;
            }
        } else {
            setSynthesisError("Speech synthesis is not supported in your browser."); return;
        }
      }
      const synth = synthesisRef.current;
      if (synth.speaking && currentUtteranceRef.current?.text === text) {
        synth.cancel(); setIsSpeaking(false); currentUtteranceRef.current = null; return;
      }
      if (synth.speaking) { synth.cancel(); }
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;
      utterance.rate = rate; utterance.pitch = 1.1; utterance.volume = 0.8;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); currentUtteranceRef.current = null; };
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("[useSpeech] Speech synthesis error:", event.error);
        setSynthesisError(`TTS error: ${event.error}`);
        setIsSpeaking(false); currentUtteranceRef.current = null;
      };
      synth.speak(utterance);
    }, [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      fullyStopRecognition();
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [fullyStopRecognition]);

  return {
    isListening, isSpeaking,
    isSupported: isRecognitionSupported, isSynthesisSupported,
    startListening, stopListening,
    speak, cancelSpeak,
    recognitionError, synthesisError,
  };
}
// --- END OF use-speech.ts FILE ---
