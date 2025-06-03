import { useState, useRef, useCallback, useEffect } from "react";

// ... (UseSpeechReturn interface as before) ...
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
  const hasAttemptedRestartRef = useRef(false); // --- NEW: Track restart attempt ---

  // ... (synthesis states and refs as before) ...
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
    // ... (same as before) ...
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
    // ... (same as before, but ensure isListening check is robust) ...
    if (recognitionRef.current) {
      // console.log("[useSpeech] fullyStopRecognition called.");
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort(); 
      recognitionRef.current = null;
    }
    // Only update state if it's actually changing
    if (isListening) { 
        setIsListening(false);
    }
  }, [isListening]);


  // We need to pass onResult down to initiateNewRecognition
  const initiateNewRecognition = useCallback((onResultCallback: (transcript: string) => void) => {
    // console.log("[useSpeech] initiateNewRecognition called.");
    const recognition = initRecognition();
    if (!recognition) {
      setRecognitionError("Could not initialize speech recognition instance.");
      return;
    }

    recognitionRef.current = recognition;
    setRecognitionError(null); // Clear previous errors on new attempt

    recognition.onstart = () => {
      setIsListening(true);
      hasAttemptedRestartRef.current = false; // Reset restart flag on successful start
      console.log("[useSpeech] Event: onstart - Mic should be active.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[event.results.length - 1];
      const transcript = speechResult[0].transcript;
      console.log(`[useSpeech] Event: onresult - Transcript: "${transcript}"`);
      
      if (transcript.trim()) {
        onResultCallback(transcript);
      }
      // NO explicit stop/abort here, rely on continuous=false and onend
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn(`[useSpeech] Event: onerror - Error: ${event.error}, Message: ${event.message}`);
      
      if (event.error === 'aborted' && !hasAttemptedRestartRef.current) {
        console.warn('[useSpeech] Event: onerror - Initial "aborted" error, attempting a single restart.');
        hasAttemptedRestartRef.current = true; // Set flag to prevent infinite restart loops
        setIsListening(false); // Reset listening state before restart attempt

        // Clean up the current failed instance before trying again
        if (recognitionRef.current) {
            recognitionRef.current.onstart = null;
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
            // No abort() or nullify ref here, as we're about to try a new init
        }
        
        setTimeout(() => { // Short delay before restarting
          console.log("[useSpeech] Restarting recognition after initial abort.");
          initiateNewRecognition(onResultCallback); // Try starting again
        }, 100); // 100ms delay
        return; // Don't proceed to fullyStopRecognition for this specific restart case
      }
      
      // For other errors, or if restart has already been attempted for 'aborted'
      if (event.error !== 'aborted') { // Only set UI error for non-aborted or if restart failed
          setRecognitionError(`Voice recognition error: ${event.error}`);
      }
      fullyStopRecognition();
    };

    recognition.onend = () => {
      console.log("[useSpeech] Event: onend - Recognition session formally ended.");
      fullyStopRecognition(); 
    };

    try {
      console.log("[useSpeech] initiateNewRecognition - Attempting recognition.start()");
      recognition.start();
    } catch (err: any) {
      console.error('[useSpeech] Exception during recognition.start():', err);
      setRecognitionError(`Failed to start voice recognition: ${err.message}`);
      fullyStopRecognition();
    }
  }, [initRecognition, fullyStopRecognition, isListening]); // Added isListening


  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      // console.log("[useSpeech] startListening() called.");
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported.");
        return;
      }

      // If a recognition is active or the ref exists, stop it first.
      // This handles rapid double-clicks or ensures a clean state.
      if (recognitionRef.current) {
        // console.log("[useSpeech] startListening: Existing recognitionRef found, ensuring it's stopped.");
        fullyStopRecognition(); 
        // Give a moment for cleanup and state to settle before initiating a new one
        setTimeout(() => {
            // console.log("[useSpeech] startListening: After timeout (due to cleanup), calling initiateNewRecognition.");
            hasAttemptedRestartRef.current = false; // Reset restart flag for a fresh user attempt
            initiateNewRecognition(onResult);
        }, 50); // A short delay
        return; 
      }
      
      // If no existing ref, proceed to initiate directly.
      hasAttemptedRestartRef.current = false; // Reset restart flag
      initiateNewRecognition(onResult);
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening] // isListening needed for fullyStopRecognition
  );

  const stopListening = useCallback(() => {
    // console.log("[useSpeech] Manual stopListening called.");
    fullyStopRecognition();
  }, [fullyStopRecognition]);

  // --- Speech Synthesis (Output) Logic ---
  const initSynthesis = useCallback(() => { /* ... as before ... */
    if (!isSynthesisSupported || typeof window === "undefined") return null;
    return window.speechSynthesis;
  }, [isSynthesisSupported]);

  useEffect(() => { /* ... as before ... */
    if (!synthesisRef.current && isSynthesisSupported) {
      synthesisRef.current = initSynthesis();
    }
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback( /* ... as before ... */
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
        setSynthesisError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false); currentUtteranceRef.current = null;
      };
      synth.speak(utterance);
    }, [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => { /* ... as before ... */
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  useEffect(() => { /* ... as before ... */
    return () => {
      fullyStopRecognition();
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [fullyStopRecognition]);

  return { /* ... as before ... */
    isListening, isSpeaking,
    isSupported: isRecognitionSupported, isSynthesisSupported,
    startListening, stopListening,
    speak, cancelSpeak,
    recognitionError, synthesisError,
  };
}
// --- END OF use-speech.ts FILE ---
