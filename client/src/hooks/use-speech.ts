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
      console.log("[useSpeech] fullyStopRecognition called.");
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onspeechend = null; // Also clear speechend
      recognitionRef.current.abort(); 
      recognitionRef.current = null;
    }
    if (isListening) {
        setIsListening(false);
    }
  }, [isListening]);

  // Helper function to contain the actual recognition setup and start
  const initiateNewRecognition = useCallback((onResultCallback: (transcript: string) => void) => {
    console.log("[useSpeech] initiateNewRecognition called.");
    const recognition = initRecognition();
    if (!recognition) {
      setRecognitionError("Could not initialize speech recognition instance.");
      return;
    }

    recognitionRef.current = recognition;
    setRecognitionError(null);

    recognition.onstart = () => {
      setIsListening(true);
      console.log("[useSpeech] Event: onstart - Mic should be active.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[event.results.length - 1];
      const transcript = speechResult[0].transcript;
      console.log(`[useSpeech] Event: onresult - Transcript: "${transcript}"`);
      
      if (transcript.trim()) {
        onResultCallback(transcript);
      }
      // NO EXPLICIT STOP/ABORT HERE. Let onspeechend handle it.
    };

    recognition.onspeechend = () => {
      console.log("[useSpeech] Event: onspeechend - Speech has stopped being detected.");
      // Now that speech has ended, explicitly stop the recognition to trigger onend.
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn(`[useSpeech] Event: onerror - Error: ${event.error}, Message: ${event.message}`);
      if (event.error === 'aborted') {
        // This might still happen if stopListening is called rapidly, or if onspeechend -> stop() causes it.
        // We mostly care that isListening is reset.
         if(isListening) setIsListening(false); 
      } else if (event.error === 'no-speech') {
        // If onspeechend doesn't fire because no speech started, this might.
        fullyStopRecognition(); 
      } else {
        setRecognitionError(`Voice recognition error: ${event.error}`);
        fullyStopRecognition(); 
      }
    };

    recognition.onend = () => {
      console.log("[useSpeech] Event: onend - Recognition session formally ended.");
      fullyStopRecognition(); 
    };

    try {
      console.log("[useSpeech] initiateNewRecognition - Attempting recognition.start()");
      recognition.start();
    } catch (err: any) {
      console.error('[useSpeech] Exception during recognition.start():', err);
      setRecognitionError(`Failed to start voice recognition: ${err.message}`);
      fullyStopRecognition();
    }
  }, [initRecognition, fullyStopRecognition, isListening]);


  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      console.log("[useSpeech] startListening() called.");
      if (!isRecognitionSupported) {
        setRecognitionError("Speech recognition is not supported.");
        return;
      }
      if (isListening && recognitionRef.current) {
        console.log("[useSpeech] startListening: Previous session was listening, stopping it now.");
        fullyStopRecognition(); 
        setTimeout(() => {
            console.log("[useSpeech] startListening: After timeout, calling initiateNewRecognition.");
            initiateNewRecognition(onResult);
        }, 50); 
        return; 
      }
      initiateNewRecognition(onResult);
    },
    [isRecognitionSupported, initRecognition, fullyStopRecognition, isListening]
  );

  const stopListening = useCallback(() => {
    console.log("[useSpeech] Manual stopListening called.");
    fullyStopRecognition();
  }, [fullyStopRecognition]);

  // --- Speech Synthesis (Output) Logic ---
  const initSynthesis = useCallback(() => { /* ... as before ... */
    if (!isSynthesisSupported || typeof window === "undefined") return null;
    return window.speechSynthesis;
  }, [isSynthesisSupported]);

  useEffect(() => { /* ... as before ... */
    if (!synthesisRef.current && isSynthesisSupported) {
      synthesisRef.current = initSynthesis();
    }
  }, [initSynthesis, isSynthesisSupported]);

  const speak = useCallback( /* ... as before ... */
    (text: string, rate: number = 1.05) => {
      if (!synthesisRef.current) {
        if (isSynthesisSupported) {
            synthesisRef.current = initSynthesis();
            if(!synthesisRef.current) {
                setSynthesisError("Speech synthesis could not be initialized."); return;
            }
        } else {
            setSynthesisError("Speech synthesis is not supported in your browser."); return;
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
        console.error("[useSpeech] Speech synthesis error:", event.error);
        setSynthesisError(`Speech synthesis error: ${event.error}`);
        setIsSpeaking(false); currentUtteranceRef.current = null;
      };
      synth.speak(utterance);
    }, [initSynthesis, isSynthesisSupported]
  );

  const cancelSpeak = useCallback(() => { /* ... as before ... */
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  useEffect(() => { /* ... as before ... */
    return () => {
      fullyStopRecognition();
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [fullyStopRecognition]);

  return { /* ... as before ... */
    isListening, isSpeaking,
    isSupported: isRecognitionSupported, isSynthesisSupported,
    startListening, stopListening,
    speak, cancelSpeak,
    recognitionError, synthesisError,
  };
}
// --- END OF use-speech.ts FILE ---
