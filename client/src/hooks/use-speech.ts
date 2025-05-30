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

  const speak = useCallback((text: string) => {
    if (!synthesisRef.current) {
      synthesisRef.current = initSynthesis();
    }

    if (synthesisRef.current) {
      // Cancel any ongoing speech
      synthesisRef.current.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.2;
      utterance.pitch = 2;
      utterance.volume = 0.8;
      
      synthesisRef.current.speak(utterance);
    }
  }, [initSynthesis]);

  return {
    isListening,
    isSupported,
    startListening: (onResult: (transcript: string) => void) => startListening(onResult),
    stopListening,
    speak,
    error,
  };
}
