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

  const startListening = useCallback((onResult: (transcript: string) => void) => {
    if (!isSupported) {
      setError("Speech recognition is not supported in your browser");
      return;
    }

    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    setError(null);
    setIsListening(true);

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(`Voice recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError("Failed to start voice recognition");
      setIsListening(false);
    }
  }, [isSupported, initRecognition]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

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
        utterance.rate = 1.0;   // You can change this to 1.2, 1.5, etc., for faster default speed
        utterance.pitch = 1.2;
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
