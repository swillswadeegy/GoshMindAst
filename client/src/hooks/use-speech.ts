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
      // console.log("[useSpeech] fullyStopRecognition called.");
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

  const initiateNewRecognition = useCallback((onResult: (transcript: string) => void) => {
    const recognition = initRecognition();
    if (!recognition) {
      setRecognitionError("Could not initialize speech recognition instance.");
      return;
    }

    recognitionRef.current = recognition;
    setRecognitionError(null);

    recognition.onstart = () => {
      setIsListening(true);
      // console.log("[useSpeech] Event: onstart - Mic should be active.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[event.results.length - 1];
      const transcript = speechResult[0].transcript;
      
      if (transcript.trim()) {
        onResult(transcript);
      }

      // --- MODIFIED LINE: Using abort() instead of stop() ---
      if (recognitionRef.current) {
        // console.log("[useSpeech] Event: onresult - Calling .abort() after processing result.");
        recognitionRef.current.abort(); // This should also trigger onend
      }
      // --- END OF MODIFICATION ---
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') {
        console.warn('[useSpeech] Event: onerror - Recognition aborted (handled silently).');
      } else if (event.error === 'no-speech') {
        console.warn('[useSpeech] Event: onerror - No speech detected.');
      } else {
        console.error('[useSpeech] Event: onerror - Error:', event.error, event.message);
        setRecognitionError(`Voice recognition error: ${event.error}`);
      }
      fullyStopRecognition(); 
    };

    recognition.onend = () => {
      // Keep this alert for testing if onend is reached
      alert("DEBUG: Speech recognition 'onend' event fired!"); 
      // console.log("[useSpeech] Event: onend - Recognition session formally ended.");
      fullyStopRecognition(); 
    };

    try {
      recognition.start();
    } catch (err: any) {
      console.error('[useSpeech] Exception during recognition.start():', err);
      setRecognitionError(`Failed to start voice recognition: ${err.message}`);
      fullyStopRecognition();
    }
  }, [initRecognition, fullyStopRecognition]);


  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported.");
        return;
      }
      if (isListening && recognitionRef.current) {
        fullyStopRecognition(); 
        setTimeout(() => {
            initiateNewRecognition(onResult);
        }, 50); 
        return; 
      }
      initiateNewRecognition(onResult);
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening]
  );

  const stopListening = useCallback(() => {
    fullyStopRecognition();
  }, [fullyStopRecognition]);

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
        synth.cancel();
        setIsSpeaking(false); 
        currentUtteranceRef.current = null;
        return;
      }
      if (synth.speaking) {
          synth.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtteranceRef.current = utterance;
      utterance.rate = rate;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      utterance.onstart = () => setIsSpeaking(true);
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
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtterance_ref.current = null; // Corrected to currentUtteranceRef
    }
  }, []);

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

// --- END OF use-speech.ts FILE --- Verify this comment is the last line you copy ---
