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
    recognition.interimResults = false; // We only want final results from onresult
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
      recognitionRef.current.abort(); // Use abort for immediate effect
      recognitionRef.current = null;
    }
    if (isListening) { // Check current state before setting
        setIsListening(false);
    }
  }, [isListening]); // isListening dependency ensures this function has fresh 'isListening'

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported.");
        return;
      }

      // If already listening (e.g., rapid double click), effectively do a 'stop' then 'start'.
      if (isListening && recognitionRef.current) {
        // console.log("[useSpeech] startListening: was already listening. Stopping old one.");
        // Calling fullyStopRecognition will set isListening to false,
        // which should allow the new session to start without being immediately stopped.
        fullyStopRecognition(); 
        // Adding a small delay for state to settle before truly starting new recognition
        setTimeout(() => {
            // console.log("[useSpeech] startListening: Proceeding to start new recognition after delay.");
            initiateNewRecognition(onResult);
        }, 50); // 50ms delay, adjust if needed
        return; 
      }
      
      // If not currently listening, or if the ref was cleared, proceed to start.
      initiateNewRecognition(onResult);
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening]
  );

  // Helper function to contain the actual recognition setup and start
  const initiateNewRecognition = useCallback((onResult: (transcript: string) => void) => {
    // console.log("[useSpeech] initiateNewRecognition called.");
    const recognition = initRecognition();
    if (!recognition) {
      setRecognitionError("Could not initialize speech recognition instance.");
      return;
    }

    recognitionRef.current = recognition;
    setRecognitionError(null); // Clear previous errors

    recognition.onstart = () => {
      setIsListening(true);
      // console.log("[useSpeech] Event: onstart - Mic should be active.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[event.results.length - 1];
      const transcript = speechResult[0].transcript;
      
      // console.log(`[useSpeech] Event: onresult - Transcript: "${transcript}"`);

      if (transcript.trim()) { // Only process if there's actual transcript
        onResult(transcript);
      }

      // Since continuous=false and interimResults=false, this event implies a "final" result for an utterance.
      // We will call stop() here to explicitly end the session and trigger onend.
      // This was the change that made the mic indicator behave but previously cut off mobile.
      // The theory is that with a proper cleanup (fullyStopRecognition) before starting a new session,
      // this explicit stop might be more reliable now.
      if (recognitionRef.current) {
        // console.log("[useSpeech] Event: onresult - Calling .stop() after processing result.");
        recognitionRef.current.stop();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (
