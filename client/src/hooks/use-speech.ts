import { useState, useRef, useCallback, useEffect } from "react"; // Added useEffect

// (Keep your UseSpeechReturn interface as is, or ensure it matches the return object)
export interface UseSpeechReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: (onResult: (transcript: string) => void) => void;
  stopListening: () => void;
  speak: (text: string, rate?: number) => void; // Assuming you have rate from TTS fix
  error: string | null; // For recognition errors
  // Add other properties like isSpeaking, synthesisError, cancelSpeak if you use them
}


export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null); // For TTS

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const initRecognition = useCallback(() => {
    if (!isSupported || typeof window === "undefined") return null;
    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    return recognition;
  }, [isSupported]);

  // Function to fully stop and clean up recognition
  const fullyStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      // console.log("[useSpeech] Fully stopping recognition and cleaning up listeners."); // For debugging
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null; // Detach onend itself before calling stop/abort
      recognitionRef.current.abort(); // Use abort for a more immediate stop
      recognitionRef.current = null; // Release the object
    }
    setIsListening(false); // Ensure state is updated
  }, []); // No dependencies, it operates on the ref

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isSupported) {
        setError("Speech recognition is not supported in your browser");
        return;
      }

      // If a recognition is somehow active, try to clean it up first.
      if (recognitionRef.current) {
        // console.log("[useSpeech] startListening called while a recognitionRef exists, attempting cleanup."); // For debugging
        fullyStopRecognition();
      }

      const recognition = initRecognition();
      if (!recognition) {
        setError("Could not initialize speech recognition instance.");
        return;
      }

      recognitionRef.current = recognition;
      setError(null);

      recognition.onstart = () => {
        // console.log("[useSpeech] Speech recognition started."); // For debugging
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
        // No explicit stop here; rely on continuous=false and onend for natural completion.
        // console.log("[useSpeech] Result received:", transcript); // For debugging
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted') {
          console.warn('[useSpeech] Speech recognition aborted (handled silently).');
        } else if (event.error === 'no-speech') {
          console.warn('[useSpeech] No speech detected.');
          // setError("No speech was detected. Please try again.");
        } else {
          console.error('[useSpeech] Speech recognition error:', event.error, event.message);
          setError(`Voice recognition error: ${event.error}`);
        }
        fullyStopRecognition(); // Use full cleanup on error
      };

         recognition.onend = () => {
      // This is where we want to put the alert
      if (recognitionRef.current) {
        recognitionRef.current.stop(); // Keep this explicit stop
      }
      setIsListening(false);
      console.log("[useSpeech] Speech recognition actually ended (onend event fired)."); // We'll replace this
    };


      try {
        recognition.start();
      } catch (err: any) {
        console.error('[useSpeech] Failed to start recognition (exception):', err);
        setError(`Failed to start voice recognition: ${err.message}`);
        fullyStopRecognition(); // Use full cleanup if .start() throws
      }
    },
    [isSupported, initRecognition, fullyStopRecognition] // Added fullyStopRecognition
  );

  const stopListening = useCallback(() => {
    // console.log("[useSpeech] stopListening called manually."); // For debugging
    fullyStopRecognition();
  }, [fullyStopRecognition]);


  // Your speak function for TTS (Text-to-Speech)
  const initSynthesis = useCallback(() => {
    if (typeof window !== "undefined" && 'speechSynthesis' in window) {
      return window.speechSynthesis;
    }
    return null;
  }, []);

  const speak = useCallback((text: string, rate: number = 1.05) => { // Adjusted default rate as per your last version
    if (!synthesisRef.current) {
      synthesisRef.current = initSynthesis();
    }
    if (synthesisRef.current) {
      const synth = synthesisRef.current;
      if (synth.speaking) {
        synth.cancel();
      } else {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = 1.1; // From your last version
        utterance.volume = 0.8; // From your last version
        // Add voice selection logic here if you have it
        synth.speak(utterance);
      }
    }
  }, [initSynthesis]);


  // Cleanup effect for when the component using this hook unmounts
  useEffect(() => {
    return () => {
      // console.log("[useSpeech] Hook unmounting, ensuring recognition is stopped."); // For debugging
      fullyStopRecognition();
      if (synthesisRef.current) {
        synthesisRef.current.cancel(); // Also cancel any speech
      }
    };
  }, [fullyStopRecognition]); // Added fullyStopRecognition


  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    speak,
    error,
    // Remember to add any other states/functions your app expects from this hook
    // e.g., isSpeaking, synthesisError, cancelSpeak from my more comprehensive TTS example
  };
}
