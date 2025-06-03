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
    recognition.interimResults = false;
    recognition.lang = "en-US";
    return recognition;
  }, [isRecognitionSupported]);

  const fullyStopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      alert("DEBUG: fullyStopRecognition() called."); // Alert here
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort(); 
      recognitionRef.current = null;
    }
    if (isListening) {
        setIsListening(false);
    }
  }, [isListening]);

  // Helper function to contain the actual recognition setup and start
  const initiateNewRecognition = useCallback((onResult: (transcript: string) => void) => {
    alert("DEBUG: initiateNewRecognition() called.");
    const recognition = initRecognition();
    if (!recognition) {
      alert("DEBUG: initiateNewRecognition - Failed to init recognition object.");
      setRecognitionError("Could not initialize speech recognition instance.");
      return;
    }

    recognitionRef.current = recognition;
    setRecognitionError(null);

    recognition.onstart = () => {
      setIsListening(true);
      alert("DEBUG: Event: onstart - Mic should be active.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[event.results.length - 1];
      const transcript = speechResult[0].transcript;
      alert(`DEBUG: Event: onresult - Transcript chunk: "${transcript.substring(0,20)}..."`);
      
      if (transcript.trim()) {
        onResult(transcript);
      }

      if (recognitionRef.current) {
        alert("DEBUG: Event: onresult - Calling .abort()");
        recognitionRef.current.abort(); 
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      alert(`DEBUG: Event: onerror - Error: ${event.error}`);
      if (event.error === 'aborted') {
        // console.warn still useful if you can ever see console
        console.warn('[useSpeech] Event: onerror - Recognition aborted (handled silently).');
      } else if (event.error === 'no-speech') {
        console.warn('[useSpeech] Event: onerror - No speech detected.');
      } else {
        console.error('[useSpeech] Event: onerror - Error details:', event.error, event.message);
        setRecognitionError(`Voice recognition error: ${event.error}`);
      }
      fullyStopRecognition(); 
    };

    recognition.onend = () => {
      alert("DEBUG: Event: onend - Recognition session formally ended.");
      fullyStopRecognition(); 
    };

    try {
      alert("DEBUG: initiateNewRecognition - Attempting recognition.start()");
      recognition.start();
    } catch (err: any) {
      alert(`DEBUG: initiateNewRecognition - EXCEPTION during recognition.start(): ${err.message}`);
      setRecognitionError(`Failed to start voice recognition: ${err.message}`);
      fullyStopRecognition();
    }
  }, [initRecognition, fullyStopRecognition]); // Dependencies for initiateNewRecognition


  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      alert("DEBUG: startListening() called.");
      if (!isRecognitionSupported) {
        alert("DEBUG: startListening - Speech recognition not supported.");
        setRecognitionError("Speech recognition is not supported.");
        return;
      }
      // Check if isListening is true from the PREVIOUS state.
      // If so, stop it, wait a bit, then start new.
      if (isListening) { // Using isListening directly from state
        alert("DEBUG: startListening - isListening was true. Stopping previous session.");
        fullyStopRecognition(); 
        setTimeout(() => {
            alert("DEBUG: startListening - After timeout (due to previous session being active), calling initiateNewRecognition.");
            initiateNewRecognition(onResult);
        }, 150); // Slightly longer timeout for debugging
        return; 
      }
      // If not currently listening, proceed to initiate directly.
      initiateNewRecognition(onResult);
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening] // isListening is important here
  );

  const stopListening = useCallback(() => {
    alert("DEBUG: stopListening() (manual call) triggered.");
    fullyStopRecognition();
  }, [fullyStopRecognition]);

  // --- Speech Synthesis (Output) Logic ---
  // (Keeping TTS logic brief as it's not the focus of this specific bug)
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
    (text: string, rate: number = 1.05) => {
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
        synth.cancel(); setIsSpeaking(false); currentUtteranceRef.current = null; return;
      }
      if (synth.speaking) { synth.cancel(); }
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;
      utterance.rate = rate; utterance.pitch = 1.1; utterance.volume = 0.8;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); currentUtteranceRef.current = null; };
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        setSynthesisError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false); currentUtteranceRef.current = null;
      };
      synth.speak(utterance);
    }, [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      alert("DEBUG: useSpeech Hook Unmounting - cleaning up recognition.");
      fullyStopRecognition();
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [fullyStopRecognition]);

  return {
    isListening, isSpeaking,
    isSupported: isRecognitionSupported, isSynthesisSupported,
    startListening, stopListening,
    speak, cancelSpeak,
    recognitionError, synthesisError,
  };
}

// --- END OF use-speech.ts FILE --- Verify this comment is the last line you copy ---
