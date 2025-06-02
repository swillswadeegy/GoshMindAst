import { useState, useRef, useCallback } from "react";

export interface UseSpeechReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  error: string | null;
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  // Check if speech recognition is supported
  const isSupported = typeof window !== "undefined" && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    return recognition;
  }, [isSupported]);

  // Initialize speech synthesis
  const initSynthesis = useCallback(() => {
    if (typeof window !== "undefined" && 'speechSynthesis' in window) {
      return window.speechSynthesis;
    }
    return null;
  }, []);

 // Inside client/src/hooks/use-speech.ts

// ... (useState, useRef, useCallback, isSupported, initRecognition, initSynthesis, etc. ... )

  const startListening = useCallback((onResult: (transcript: string) => void) => {
    if (!isSupported) {
      setError("Speech recognition is not supported in your browser");
      return;
    }

    // Optional: If one is already active from a previous erroneous state, try to stop it.
    // if (recognitionRef.current && isListening) { // isListening might not be needed here if onstart sets it
    //   recognitionRef.current.stop();
    // }

    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    setError(null);
    // setIsListening(true); // onstart is a better place for this

// Inside client/src/hooks/use-speech.ts
// Within the startListening function:

    recognition.onstart = () => {
      setIsListening(true);
      // console.log("[useSpeech] Speech recognition started."); // For debugging
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      // --- REMOVE OR COMMENT OUT THE EXPLICIT STOP ---
      // if (recognitionRef.current) {
      //   recognitionRef.current.stop(); // THIS LINE IS THE SUSPECT
      // }
      // ---------------------------------------------
      // console.log("[useSpeech] Result received:", transcript); // For debugging
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') {
        console.warn('[useSpeech] Speech recognition aborted (handled silently).');
      } else if (event.error === 'no-speech') {
        console.warn('[useSpeech] No speech detected.');
        // setError("No speech was detected. Please try again."); // Only set error if you want to display it
      } else {
        console.error('[useSpeech] Speech recognition error:', event.error, event.message);
        setError(`Voice recognition error: ${event.error}`);
      }

      if (recognitionRef.current && event.error !== 'aborted') {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log("[useSpeech] Speech recognition actually ended (onend event fired)."); // Keep this log for testing
      // If the mic indicator issue returns with the above change, one *could* try an explicit stop here:
      // if (recognitionRef.current) {
      //   recognitionRef.current.stop();
      // }
    };

    // ... rest of startListening (try/catch for recognition.start())

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError("Failed to start voice recognition");
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // abort if .start() itself fails
      }
      setIsListening(false);
    }
  }, [isSupported, initRecognition]); // Removed isListening from here if not used for the initial stop check

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // This should trigger onend
    }
  }, []);

  // ... (your speak function and the rest of the hook) ...

  // Inside use-speech.ts

// ... (other code like initSynthesis, useState, etc. remains the same) ...

  const speak = useCallback((text: string) => {
    if (!synthesisRef.current) {
      synthesisRef.current = initSynthesis();
    }

    if (synthesisRef.current) {
      // Get a direct reference to window.speechSynthesis for convenience
      const synth = synthesisRef.current; 

      if (synth.speaking) {
        // If it's currently speaking, cancel the speech.
        synth.cancel();
        // console.log("Speech cancelled by toggle."); // For your testing
      } else {
        // If it's not speaking, create and speak the new utterance.
        const utterance = new SpeechSynthesisUtterance(text);
        
        // --- Your Speech Settings ---
        utterance.rate = 1.05;   // You can change this to 1.2, 1.5, etc., for faster default speed
        utterance.pitch = 1.1;
        utterance.volume = 0.8;
        // You could also try setting a preferred voice here if you wanted,
        // but as discussed, that's more complex.
        // Example:
        // const voices = synth.getVoices();
        // if (voices.length > 0) {
        //   const preferredVoice = voices.find(v => v.name === "Your Preferred Voice Name");
        //   if (preferredVoice) utterance.voice = preferredVoice;
        // }
        // --- End of Settings ---
        
        synth.speak(utterance);
        // console.log("Speech started for:", text); // For your testing
      }
    }
  }, [initSynthesis]); // Keep dependencies for useCallback

// ... (rest of the hook, like the return statement) ...

  return {
    isListening,
    isSupported,
    startListening: (onResult: (transcript: string) => void) => startListening(onResult),
    stopListening,
    speak,
    error,
  };
}
