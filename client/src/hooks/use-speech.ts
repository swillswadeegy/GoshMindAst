import { useState, useRef, useCallback, useEffect } from "react";

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean; // To track if TTS is active
  isRecognitionSupported: boolean; // For Speech Recognition
  isSynthesisSupported: boolean; // For Speech Synthesis
  startListening: (onResult: (transcript: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void; // TTS speak function with optional rate
  cancelSpeak: () => void; // To stop TTS
  recognitionError: string | null;
  synthesisError: string | null;
}

export function useSpeech(): UseSpeechReturn {
  // States for Speech Recognition (input)
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // States for Speech Synthesis (output)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // --- Feature Support Checks ---
  const isRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const isSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // --- Speech Recognition (Input) Logic ---
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

  // Function to fully stop and clean up recognition
  const fullyStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      // console.log("[useSpeech] Fully stopping recognition and cleaning up listeners."); // For debugging
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort(); // Use abort for a more immediate stop
      recognitionRef.current = null;
    }
    if (isListening) { // Only set if it was true, to avoid unnecessary re-renders if already false
        setIsListening(false);
    }
  }, [isListening]); // Added isListening to dependencies

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in your browser.");
        return;
      }

      if (recognitionRef.current) {
        // console.log("[useSpeech] startListening: Cleaning up previous recognition instance.");
        fullyStopRecognition();
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
        // console.log("[useSpeech] Speech recognition started.");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const speechResult = event.results[event.results.length - 1];
        const transcript = speechResult[0].transcript;
        
        // console.log(`[useSpeech] onresult - transcript: ${transcript}`);
        onResult(transcript);

        if (recognitionRef.current) {
          // console.log("[useSpeech] Calling stop() in onresult after processing transcript.");
          recognitionRef.current.stop(); // This should trigger onend
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted') {
          console.warn('[useSpeech] Speech recognition aborted (handled silently).');
        } else if (event.error === 'no-speech') {
          console.warn('[useSpeech] No speech detected.');
          // setError("No speech was detected. Please try again."); // User can enable this if desired
        } else {
          console.error('[useSpeech] Speech recognition error:', event.error, event.message);
          setRecognitionError(`Voice recognition error: ${event.error}`);
        }
        fullyStopRecognition();
      };

      recognition.onend = () => {
        console.log("[useSpeech] Speech recognition actually ended (onend event fired)."); // For your debugging
        fullyStopRecognition(); // Use full cleanup when recognition naturally ends
      };

      try {
        recognition.start();
      } catch (err: any) {
        console.error('[useSpeech] Failed to start recognition (exception):', err);
        setRecognitionError(`Failed to start voice recognition: ${err.message}`);
        fullyStopRecognition();
      }
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition]
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
    (text: string, rate: number = 1.05) => { // Default rate set as per your last working version
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
        // If speaking the same text, cancel it (toggle off)
        synth.cancel();
        setIsSpeaking(false); 
        currentUtteranceRef.current = null;
        // console.log("[useSpeech] Speech cancelled by toggle (same text).");
        return; // Don't proceed to speak it again immediately
      }
      
      // If speaking something else, or not speaking, cancel any current and speak new.
      if (synth.speaking) {
          synth.cancel();
          // setIsSpeaking will be handled by onend of previous, or onstart of new
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;

      utterance.rate = rate;
      utterance.pitch = 1.1;  // From your last working version
      utterance.volume = 0.8; // From your last working version
      // utterance.lang = 'en-US';

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSynthesisError(null);
        // console.log("[useSpeech] Utterance started.");
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null; // Clear ref once ended
        // console.log("[useSpeech] Utterance ended.");
      };
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("[useSpeech] Speech synthesis error:", event.error);
        setSynthesisError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };
      
      synth.speak(utterance);
      // console.log("[useSpeech] Speech initiated for:", text.substring(0, 30) + "...");

    }, [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
      // console.log("[useSpeech] Speech explicitly cancelled via cancelSpeak.");
    }
  }, []);


  // Cleanup effect for when the component using this hook unmounts
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
