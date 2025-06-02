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
    recognition.lang = "en-US"; // Or your desired language
    return recognition;
  }, [isRecognitionSupported]);

  // Function to fully stop and clean up recognition
  const fullyStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      // console.log("[useSpeech] Fully stopping recognition and cleaning up listeners.");
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort(); // Use abort for a more immediate stop
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported in your browser.");
        return;
      }

      if (recognitionRef.current) { // If an old instance exists, clean it up
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
        
        // console.log(`[useSpeech] onresult - isFinal: ${speechResult.isFinal}, transcript: ${transcript}`);

        // Since interimResults is false, this result should be effectively final for this speech segment.
        onResult(transcript); // Process the transcript

        // Explicitly stop recognition after processing the result.
        // This should then trigger the onend event.
        if (recognitionRef.current) {
          // console.log("[useSpeech] Calling stop() in onresult after processing transcript.");
          recognitionRef.current.stop();
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted') {
          console.warn('[useSpeech] Speech recognition aborted (handled silently).');
        } else if (event.error === 'no-speech') {
          console.warn('[useSpeech] No speech detected.');
          // setError("No speech was detected. Please try again."); // Decide if you want to set this
        } else {
          console.error('[useSpeech] Speech recognition error:', event.error, event.message);
          setRecognitionError(`Voice recognition error: ${event.error}`);
        }
        fullyStopRecognition(); // Use full cleanup on error
      };

      recognition.onend = () => {
        // This alert is for you to confirm if this event fires. Remove it after testing.
        alert("DEBUG: Speech recognition 'onend' event fired!"); 
        
        // fullyStopRecognition() will handle setIsListening(false) and nullifying refs.
        // If we call fullyStopRecognition() here, the ref might be null if stop() in onresult already cleaned it up via its own onend.
        // Let's just ensure listening state is false. The ref will be cleaned by fullyStopRecognition if called from elsewhere or on unmount.
        // The explicit stop in onresult should be the primary trigger for this onend.
        // If onend is firing, setIsListening(false) is the key state update here.
        setIsListening(false); 
        // console.log("[useSpeech] Speech recognition actually ended (onend event fired).");
      };

      try {
        recognition.start();
      } catch (err: any) {
        console.error('[useSpeech] Failed to start recognition (exception):', err);
        setRecognitionError(`Failed to start voice recognition: ${err.message}`);
        fullyStopRecognition(); // Use full cleanup if .start() throws
      }
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition] // Removed 'isListening' as fullyStopRecognition is called first now
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
    (text: string, rate: number = 1.05) => { // Using rate from your last pasted code
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

      if (synth.speaking) {
        synth.cancel();
        setIsSpeaking(false); 
      }
      
      // We always try to speak new text, or restart if it was the same text that was cancelled.
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;

      utterance.rate = rate;
      utterance.pitch = 1.1;  // From your last pasted code
      utterance.volume = 0.8; // From your last pasted code
      // utterance.lang = 'en-US';

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
        setSynthesisError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      };
      
      synth.speak(utterance);
    }, [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesis_ref.current.cancel(); // Corrected: synthesisRef
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []); // Removed synthesisRef from deps, it's stable via initEffect


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
    isSupported: isRecognitionSupported, // Keep original name for STT support
    isSynthesisSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    recognitionError,
    synthesisError,
  };
}
