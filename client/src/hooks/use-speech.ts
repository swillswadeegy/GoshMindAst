import { useState, useRef, useCallback, useEffect } from "react"; // Added useEffect

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean; // Added to indicate TTS state
  isSupported: boolean; // For Speech Recognition
  isSynthesisSupported: boolean; // For Speech Synthesis
  startListening: (onResult: (transcript: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void; // Added optional rate parameter
  cancelSpeak: () => void; // Added to explicitly cancel speech
  recognitionError: string | null;
  synthesisError: string | null; // Added for synthesis specific errors
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

    recognition.continuous = false; // Important: stops after one phrase
    recognition.interimResults = false;
    recognition.lang = "en-US"; // Or your desired language

    return recognition;
  }, [isRecognitionSupported]);

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in your browser.");
        return;
      }

      // Stop any existing recognition before starting a new one
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
        // console.log("[useSpeech] Stopped previous recognition instance.");
      }

      const recognition = initRecognition();
      if (!recognition) {
        setRecognitionError("Failed to initialize speech recognition.");
        return;
      }

      recognitionRef.current = recognition;
      setRecognitionError(null);
      // setIsListening(true); // Will be set by onstart

      recognition.onstart = () => {
        // console.log("[useSpeech] Speech recognition started.");
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        // console.log("[useSpeech] Speech recognition result:", transcript);
        onResult(transcript);
        // No need to call stop() here if continuous is false, onend will fire.
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("[useSpeech] Speech recognition error:", event.error);
        setRecognitionError(`Voice recognition error: ${event.error}`);
        if (recognitionRef.current) {
          recognitionRef.current.abort(); // Use abort for critical errors
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        // console.log("[useSpeech] Speech recognition ended.");
        setIsListening(false);
        // recognitionRef.current = null; // Optional: cleanup ref after it has ended
      };

      try {
        recognition.start();
      } catch (err) {
        console.error("[useSpeech] Failed to start recognition:", err);
        setRecognitionError("Failed to start voice recognition (exception).");
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
        setIsListening(false);
      }
    },
    [isRecognitionSupported, initRecognition, isListening] // Added isListening dependency
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // console.log("[useSpeech] Manually stopping speech recognition.");
      recognitionRef.current.stop(); // This will trigger the 'onend' event.
    }
  }, []);


  // --- Speech Synthesis (Output) Logic ---
  const initSynthesis = useCallback(() => {
    if (!isSynthesisSupported || typeof window === "undefined") return null;
    return window.speechSynthesis;
  }, [isSynthesisSupported]);

  // Ensure synthesisRef is initialized
  useEffect(() => {
    if (!synthesisRef.current && isSynthesisSupported) {
      synthesisRef.current = initSynthesis();
    }
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback(
    (text: string, rate: number = 1.2) => { // Default rate set to 1.2 (20% faster)
      if (!synthesisRef.current) {
        setSynthesisError("Speech synthesis is not initialized.");
        if (isSynthesisSupported) { // Attempt to initialize if not done yet
            synthesisRef.current = initSynthesis();
            if(!synthesisRef.current) return; // Still couldn't initialize
        } else {
            setSynthesisError("Speech synthesis is not supported in your browser.");
            return;
        }
      }

      const synth = synthesisRef.current;

      if (synth.speaking) {
        // If already speaking, a click should stop the current speech.
        synth.cancel();
        setIsSpeaking(false); // Explicitly set speaking state
        // console.log("[useSpeech] Speech cancelled by toggle.");
        // If the same text is clicked again, we want it to play, so don't return yet.
        // Let it fall through to speak if the intention is to restart.
        // However, if the intention is pure toggle (play/stop the *same* text),
        // we might need to compare 'text' with the text of 'currentUtteranceRef.current'.
        // For simplicity now, cancel always stops, next click always starts new.
        // If you click another message's speak button, this is the desired behavior.
      }
      
      // Proceed to speak the new text (or restart the current one if it was cancelled)
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance; // Keep track of the current utterance

      // --- Speech Settings ---
      utterance.rate = rate; // Use provided rate, or default (e.g., 1.0, 1.2, 1.5)
      utterance.pitch = 1.0; // Adjust as desired
      utterance.volume = 0.9; // Adjust as desired
      // utterance.lang = 'en-US'; // Set language if needed

      // Example of trying to select a preferred voice (complex, OS/browser dependent)
      // const voices = synth.getVoices();
      // if (voices.length > 0) {
      //   // Log voices to console to see available options on your system:
      //   // console.table(voices.map(v => ({name: v.name, lang: v.lang, default: v.default, localService: v.localService })));
      //   const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.localService); // Example: find a local English voice
      //   if (preferredVoice) utterance.voice = preferredVoice;
      // }
      // --- End of Settings ---

      utterance.onstart = () => {
        setIsSpeaking(true);
        setSynthesisError(null);
        // console.log("[useSpeech] Utterance started.");
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
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

    }, [initSynthesis, isSynthesisSupported] // Removed synthesisRef from deps as it's a ref, initSynthesis handles its setup
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
      // console.log("[useSpeech] Speech explicitly cancelled via cancelSpeak.");
    }
  }, []); // Removed synthesisRef from deps

  // Cleanup: cancel speech and recognition when the component unmounts
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // More forceful than stop for unmount
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, []);


  return {
    isListening,
    isSpeaking,
    isSupported: isRecognitionSupported,
    isSynthesisSupported,
    startListening, // The returned startListening already correctly refers to the memoized one
    stopListening,
    speak,
    cancelSpeak,
    recognitionError,
    synthesisError,
  };
}
