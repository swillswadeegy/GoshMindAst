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
      // console.log("[useSpeech] fullyStopRecognition: Cleaning up.");
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort(); // Use abort for immediate effect
      recognitionRef.current = null;
    }
    // Only update state if it's actually changing to prevent potential loops if isListening is a dependency
    if (isListening) { 
        setIsListening(false);
    }
  }, [isListening]); // isListening is a dependency here

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported.");
        return;
      }

      // If a previous recognition is active according to our state, stop it.
      // This handles rapid clicks more gracefully.
      if (isListening && recognitionRef.current) {
        // console.log("[useSpeech] startListening: Previous session was listening, stopping it now.");
        fullyStopRecognition(); // This will set isListening to false
        // It's important that fullyStopRecognition sets isListening to false
        // so a new session can truly start after this.
        // We might need a very brief delay to ensure state updates before restarting,
        // or rely on the fact that a new recognition object is created.
        // For now, let's proceed directly to creating a new one.
      }
      
      // It's possible that even after fullyStopRecognition, isListening might not have updated
      // in this exact render cycle if it was a dependency. This can be tricky.
      // A robust way is to ensure fullyStopRecognition is effective before proceeding.
      // However, creating a new recognition object often sidesteps this.

      const recognition = initRecognition();
      if (!recognition) {
        setRecognitionError("Could not initialize speech recognition.");
        return;
      }

      recognitionRef.current = recognition;
      setRecognitionError(null); // Clear previous errors

      recognition.onstart = () => {
        setIsListening(true);
        // console.log("[useSpeech] Speech recognition started.");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const speechResult = event.results[event.results.length - 1];
        const transcript = speechResult[0].transcript;
        // console.log(`[useSpeech] onresult - transcript: ${transcript}`);
        onResult(transcript);
        // DO NOT explicitly stop here - let continuous=false and onend handle it
        // to allow full sentence capture on mobile.
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted') {
          console.warn('[useSpeech] Speech recognition aborted (e.g. by rapid clicks or programmatic stop). Handled silently.');
        } else if (event.error === 'no-speech') {
          console.warn('[useSpeech] No speech detected.');
          // setRecognitionError("No speech was detected. Please try again.");
        } else {
          console.error('[useSpeech] Speech recognition error:', event.error, event.message);
          setRecognitionError(`Voice recognition error: ${event.error}`);
        }
        fullyStopRecognition(); // Ensure full cleanup on any error
      };

      recognition.onend = () => {
        console.log("[useSpeech] Speech recognition actually ended (onend event fired).");
        // This is the primary place for cleanup when recognition ends naturally or is stopped.
        fullyStopRecognition();
      };

      try {
        // console.log("[useSpeech] Attempting to call recognition.start()");
        recognition.start();
      } catch (err: any) {
        console.error('[useSpeech] Failed to start recognition (exception):', err);
        setRecognitionError(`Failed to start voice recognition: ${err.message}`);
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening] // Added isListening
  );

  const stopListening = useCallback(() => {
    // console.log("[useSpeech] stopListening (manual call) triggered.");
    fullyStopRecognition();
  }, [fullyStopRecognition]);

  // --- Speech Synthesis (Output) Logic ---
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
                setSynthesisError("Speech synthesis could not be initialized.");
                return;
            }
        } else {
            setSynthesisError("Speech synthesis is not supported in your browser.");
            return;
        }
      }
      const synth = synthesisRef.current;
      if (synth.speaking && currentUtteranceRef.current?.text === text) {
        synth.cancel();
        setIsSpeaking(false); 
        currentUtteranceRef.current = null;
        return;
      }
      if (synth.speaking) {
          synth.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;
      utterance.rate = rate;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("[useSpeech] Speech synthesis error:", event.error);
        setSynthesisError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
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
    isListening,
    isSpeaking,
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
