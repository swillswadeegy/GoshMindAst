import { useState, useRef, useCallback, useEffect } from "react";

// Updated interface to reflect common needs
export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean; // For TTS state
  isRecognitionSupported: boolean;
  isSynthesisSupported: boolean;
  startListening: (onResult: (transcript: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void; // With optional rate for TTS
  cancelSpeak: () => void; // To stop TTS
  recognitionError: string | null; // Renamed from 'error' for clarity
  synthesisError: string | null;
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // TTS States and Refs from our previous working TTS version
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);


  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported = // Added for completeness
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

  // Robust cleanup function
  const fullyStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      // console.log("[useSpeech] fullyStopRecognition called.");
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onspeechend = null;
      recognitionRef.current.abort(); // Use abort for immediate effect
      recognitionRef.current = null;
    }
    if (isListening) { // Only set state if it's actually changing
        setIsListening(false);
    }
  }, [isListening]); // isListening dependency


  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in your browser");
        return;
      }

      // If already listening (e.g. rapid click), stop the old one first.
      if (isListening && recognitionRef.current) {
        // console.log("[useSpeech] startListening: was listening, stopping previous.");
        fullyStopRecognition();
        // Give a moment for state to settle before restarting
        setTimeout(() => {
          // console.log("[useSpeech] startListening: initiating new recognition after delay.");
          initiateNewRecognition(onResult);
        }, 50); // 50ms should be enough
        return;
      }
      
      initiateNewRecognition(onResult);
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening] // Added isListening
  );
  
  // Helper for the main recognition logic
  const initiateNewRecognition = useCallback((onResult: (transcript: string) => void) => {
    const recognition = initRecognition();
    if (!recognition) {
      setRecognitionError("Failed to initialize recognition."); // More specific error
      return;
    }

    recognitionRef.current = recognition;
    setRecognitionError(null); // Clear previous errors

    recognition.onstart = () => {
      setIsListening(true);
      console.log("[useSpeech] Event: onstart");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => { // Added type
      const transcript = event.results[0][0].transcript;
      console.log("[useSpeech] Event: onresult - Transcript:", transcript);
      onResult(transcript);
      // NO EXPLICIT STOP HERE - to allow full sentence capture
    };

    // NEW: Use onspeechend to trigger stop
    recognition.onspeechend = () => {
      console.log("[useSpeech] Event: onspeechend - User likely finished speaking.");
      if (recognitionRef.current) {
        recognitionRef.current.stop(); // Now call stop, this should trigger onend
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => { // Added type
      console.warn(`[useSpeech] Event: onerror - Error: ${event.error}, Message: ${event.message}`);
      if (event.error === 'aborted') {
        // Usually from programmatic stop, or rapid clicks.
        // fullyStopRecognition will handle setIsListening(false)
      } else if (event.error === 'no-speech') {
        // setRecognitionError("No speech detected, please try again."); // Optional UI error
      } else {
        setRecognitionError(`Voice recognition error: ${event.error}`);
      }
      fullyStopRecognition(); // Clean up on any error
    };

    recognition.onend = () => {
      console.log("[useSpeech] Event: onend - Recognition session formally ended.");
      fullyStopRecognition(); // Final cleanup
    };

    try {
      console.log("[useSpeech] Calling recognition.start()");
      recognition.start();
    } catch (err: any) { // Typed err
      console.error('[useSpeech] Failed to start recognition (exception):', err);
      setRecognitionError("Failed to start voice recognition");
      fullyStopRecognition(); // Ensure cleanup if start() itself throws
    }
  }, [initRecognition, fullyStopRecognition]); // Removed isListening, onResult as initiateNewRecognition is now self-contained


  const stopListening = useCallback(() => {
    // console.log("[useSpeech] Manual stopListening called.");
    fullyStopRecognition();
  }, [fullyStopRecognition]);


  // --- Speech Synthesis (TTS - Reinstating the toggle logic and rate) ---
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
    (text: string, rate: number = 1.0) => { // Default rate back to 1.0, can be overridden
      if (!synthesisRef.current) {
        if (isSynthesisSupported) {
            synthesisRef.current = initSynthesis();
            if(!synthesisRef.current) {
                setSynthesisError("Speech synthesis could not be initialized.");
                return;
            }
        } else {
            setSynthesisError("Speech synthesis is not supported.");
            return;
        }
      }

      const synth = synthesisRef.current;

      // Toggle behavior: if speaking same text, cancel; otherwise, cancel current and speak new.
      if (synth.speaking) {
        synth.cancel(); // Stop current speech regardless
        setIsSpeaking(false);
        if (currentUtteranceRef.current?.text === text) {
          // If it was the same text, it's now stopped (toggled off)
          currentUtteranceRef.current = null;
          // console.log("[useSpeech] TTS toggled OFF for same text.");
          return;
        }
        // If it was different text, cancel clears it, and we'll speak the new one below.
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;

      utterance.rate = rate;
      utterance.pitch = 1.1; // Your previous value
      utterance.volume = 0.8; // Your previous value
      // utterance.lang = 'en-US'; // Can be set if needed

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSynthesisError(null);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("[useSpeech] Speech synthesis error:", event.error);
        setSynthesisError(`TTS error: ${event.error}`);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };
      
      synth.speak(utterance);
      // console.log("[useSpeech] TTS initiated for:", text.substring(0,20) + "...");
    },
    [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  // Cleanup on unmount
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
