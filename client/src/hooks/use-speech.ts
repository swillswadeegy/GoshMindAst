// Inside client/src/hooks/use-speech.ts

// ... (keep your existing useState, useRef, useCallback, isSupported, initRecognition, initSynthesis) ...
// ... (keep your speak function) ...
// ... (keep your UseSpeechReturn interface, ensure startListening matches signature) ...

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null); // From your previous code

  const isSupported = typeof window !== "undefined" && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const initRecognition = useCallback(() => {
    if (!isSupported) return null;
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    return recognition;
  }, [isSupported]);

  const initSynthesis = useCallback(() => { // For speak function
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

    if (recognitionRef.current && isListening) {
      // console.warn("[useSpeech] startListening called while already listening. Stopping previous.");
      recognitionRef.current.stop(); // Stop previous if any
    }

    const recognition = initRecognition();
    if (!recognition) {
        setError("Could not initialize speech recognition.");
        return;
    }

    recognitionRef.current = recognition;
    setError(null);

    recognition.onstart = () => {
      setIsListening(true);
      // console.log("[useSpeech] Speech recognition started.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[event.results.length - 1]; // Get the last result
      const transcript = speechResult[0].transcript;
      
      // alert(`DEBUG: onresult fired. Transcript: ${transcript.substring(0,30)}... isFinal: ${speechResult.isFinal}`); // DEBUG

      // Since interimResults is false, this result should be final.
      // Process the result:
      onResult(transcript);

      // Now, explicitly stop the recognition.
      // This should trigger the onend event.
      if (recognitionRef.current) {
        // console.log("[useSpeech] Calling stop() in onresult after processing final transcript."); // DEBUG
        recognitionRef.current.stop();
      }
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

      // Ensure cleanup even on error
      if (recognitionRef.current && event.error !== 'aborted') {
        recognitionRef.current.stop(); // Or abort() for some errors
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      alert("DEBUG: Speech recognition 'onend' event fired!"); // Keep alert for this test
      // console.log("[useSpeech] Speech recognition actually ended (onend event fired).");
    };

    try {
      recognition.start();
    } catch (err: any) {
      console.error('[useSpeech] Failed to start recognition (exception):', err);
      setError(`Failed to start voice recognition: ${err.message}`);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      setIsListening(false);
    }
  }, [isSupported, initRecognition, isListening]); // Added isListening to dependency array

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // Your speak function (make sure it's the one that works for you with play/stop and rate)
  const speak = useCallback((text: string, rate: number = 1.05) => {
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
        utterance.pitch = 1.1; 
        utterance.volume = 0.8; 
        synth.speak(utterance);
      }
    }
  }, [initSynthesis]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    speak,
    error,
  };
}
