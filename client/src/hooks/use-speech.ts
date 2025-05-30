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

    recognition.onstart = () => {
      setIsListening(true);
      // console.log("Speech recognition started."); // For debugging
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => { // Type added for clarity
      const transcript = event.results[0][0].transcript;
      onResult(transcript); // Send the result to your component

      // --- ADD THIS LINE ---
      // Explicitly stop recognition after a result is processed.
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        // console.log("Explicitly stopped recognition in onresult."); // For debugging
      }
      // --------------------
    };

   // Inside client/src/hooks/use-speech.ts
// This is within your startListening function, where recognition.onerror is defined.

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Check for specific errors you might want to handle silently
      // or differently from critical errors.

      if (event.error === 'aborted') {
        // This error often happens if recognition is stopped very quickly
        // after starting, e.g., by a rapid double-click on the mic button
        // or by your code calling .stop() programmatically right after a result.
        // We can log it for debugging but not show it as an error to the user.
        console.warn('[useSpeech] Speech recognition aborted (handled silently). User likely clicked stop or double-clicked.');
        // NO CALL TO setError() HERE FOR 'aborted'
      } else if (event.error === 'no-speech') {
        // This happens if the user clicks the mic but says nothing.
        console.warn('[useSpeech] No speech detected.');
        // You can decide if you want to show an error for this or handle it silently.
        // To show no error to the user for this case either, simply do nothing here
        // or comment out any setError call:
        // setError("No speech was detected. Please try again."); // Uncomment if you WANT an error for no-speech
      } else {
        // For all other types of errors, which might be more critical
        // (e.g., 'network', 'audio-capture', 'not-allowed', 'service-not-allowed'),
        // display them.
        console.error('[useSpeech] Speech recognition error:', event.error, event.message);
        setError(`Voice recognition error: ${event.error}`);
      }

      // Always ensure the listening state is reset and recognition is stopped (if applicable)
      // The stop() call might be redundant if the error was 'aborted', as it's already stopping/stopped.
      // For other errors, explicitly calling stop() is a good safeguard.
      if (recognitionRef.current && event.error !== 'aborted') {
        recognitionRef.current.stop();
      }
      setIsListening(false); // Reset the listening state in your UI
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log("Speech recognition actually ended (onend event fired)."); // For debugging
      // recognitionRef.current = null; // Optional: nullify ref if you want to be very clean
    };

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
