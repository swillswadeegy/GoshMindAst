import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Brain } from "lucide-react";
import { ChatMessage } from "@/components/chat-message";
import { VoiceInput } from "@/components/voice-input";
import { useSpeech } from "@/hooks/use-speech";
import { sendChatMessage, getConversationHistory } from "@/lib/openai-client";
import { useToast } from "@/hooks/use-toast";
import type { Message } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default function Chat() {
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceInput, setIsVoiceInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null); // Ref for the header
  const footerRef = useRef<HTMLElement>(null); // Ref for the footer
  const [contentPaddingTop, setContentPaddingTop] = useState(0);
  const [contentPaddingBottom, setContentPaddingBottom] = useState(0);

  const { speak } = useSpeech();
  const { toast } = useToast();

  // --- Calculate and set padding based on header/footer height ---
  useEffect(() => {
    const calculatePaddings = () => {
      if (headerRef.current) {
        setContentPaddingTop(headerRef.current.offsetHeight);
      }
      if (footerRef.current) {
        setContentPaddingBottom(footerRef.current.offsetHeight);
      }
    };

    calculatePaddings(); // Initial calculation
    // Recalculate if window resizes (e.g., soft keyboard, orientation change)
    window.addEventListener('resize', calculatePaddings);
    // Observe footer for height changes (e.g. textarea resize)
    let footerObserver: ResizeObserver | undefined;
    if (footerRef.current) {
        footerObserver = new ResizeObserver(calculatePaddings);
        footerObserver.observe(footerRef.current);
    }


    return () => {
      window.removeEventListener('resize', calculatePaddings);
      if (footerObserver && footerRef.current) {
        footerObserver.unobserve(footerRef.current);
      }
    };
  }, []); // Empty dependency array, runs once on mount and cleans up

  const { data: conversationData } = useQuery({
    queryKey: ['/api/conversation', SESSION_ID],
    queryFn: () => getConversationHistory(SESSION_ID),
    refetchOnMount: true,
  });

  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages);
    }
  }, [conversationData]);

  const sendMessageMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      // Auto-speak logic (ensure you have useMobile and lastSpokenAssistantMessageIdRef if using)
      // const isMobile = useMobile();
      // if (isMobile && assistantMessage.id !== lastSpokenAssistantMessageIdRef.current) {
      //   speak(response.response);
      //   lastSpokenAssistantMessageIdRef.current = assistantMessage.id;
      // }
      queryClient.invalidateQueries({ 
        queryKey: ['/api/conversation', SESSION_ID] 
      });
    },
    onError: (error) => {
      console.error("Send message error:", error);
      toast({ /* ... */ });
    },
  });

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto'; // Reset height to shrink if needed
      // Calculate scrollHeight and apply it, respecting max-height
      const maxHeight = 128; // (8rem or max-h-32 from Tailwind)
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      // Recalculate footer height for padding adjustment after textarea resizes
      if (footerRef.current) {
        setContentPaddingBottom(footerRef.current.offsetHeight);
      }
    }
  };

  useEffect(() => { // Call autoResizeTextarea when inputMessage changes
    autoResizeTextarea();
  }, [inputMessage]);


  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    // autoResizeTextarea will be called by the useEffect above
  };

  const handleSendMessage = () => {
    const messageContent = inputMessage.trim();
    if (!messageContent || sendMessageMutation.isPending) return;
    const userMessage: Message = { /* ... */ id: `user_${Date.now()}`, role: "user", content: messageContent, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    if (textareaRef.current) textareaRef.current.style.height = 'auto'; // Reset for next input
    sendMessageMutation.mutate({ message: messageContent, sessionId: SESSION_ID });
    setIsVoiceInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    setIsVoiceInput(true);
    if (transcript.trim()) {
      const userMessage: Message = { /* ... */ id: `user_voice_${Date.now()}`, role: "user", content: transcript, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, userMessage]);
      sendMessageMutation.mutate({ message: transcript, sessionId: SESSION_ID });
    }
  };

  // --- MODIFIED AUTO-SCROLL LOGIC ---
  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // Check if the user is scrolled near the bottom before auto-scrolling,
      // or if it's the very first load of messages.
      // (scrollHeight - scrollTop - clientHeight) is roughly the distance from bottom.
      // Allow some threshold, e.g., 100px.
      const isScrolledNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      if (messages.length <= 2 || isScrolledNearBottom) { // Auto-scroll for first couple of messages or if user is already at bottom
        // A slight delay can sometimes help ensure rendering is complete
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 0); // 0ms delay pushes it to the end of the current execution queue
      }
    }
  }, [messages]); // Only re-run when messages change

  useEffect(() => {
    if (textareaRef.current && !isVoiceInput) { // Don't refocus if voice input just happened
      textareaRef.current.focus();
    }
  }, [messages, isVoiceInput]); // Refocus after new message, unless it was voice

  const showWelcome = messages.length === 0 && !sendMessageMutation.isPending;

  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      <header ref={headerRef} className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 sm:py-4 sticky top-0 z-20">
        <div className="flex items-center justify-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Policy Bot</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden" 
            style={{ 
              paddingTop: `${contentPaddingTop}px`, 
              // paddingBottom will be handled by the chat messages div itself, 
              // or we can apply to main if footer wasn't sticky
            }}>
        {showWelcome ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center" 
               /* No dynamic padding here, its parent <main> has paddingTop */ >
            <div className="max-w-md"> {/* ... welcome content ... */} </div>
          </div>
        ) : (
          <div 
            ref={chatContainerRef}
            className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto" // Removed pt-XX, pb-XX here, will use dynamic style
            style={{
                // paddingTop is handled by main, this ensures space for the sticky footer
                paddingBottom: `${contentPaddingBottom}px` 
            }}
          >
            {messages.map((message) => (
              <ChatMessage key={message.id || message.timestamp} message={message} onSpeak={message.role === "assistant" ? () => speak(message.content) : undefined} />
            ))}
            {sendMessageMutation.isPending && ( /* ... loading indicator ... */ )}
          </div>
        )}
      </main>

      <footer ref={footerRef} className="bg-white border-t border-gray-200 p-3 sm:p-4 sticky bottom-0 z-20">
        {/* ... input area ... */}
        <div className="flex items-end space-x-2 sm:space-x-3">
          <div className="relative flex-shrink-0">
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={sendMessageMutation.isPending} />
          </div>
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="resize-none rounded-2xl border-gray-300 px-4 py-3 pr-12 focus:border-primary focus:ring-primary/50 text-sm max-h-32 min-h-[48px] w-full"
              rows={1}
              disabled={sendMessageMutation.isPending}
            />
            <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || sendMessageMutation.isPending} className="absolute right-2 bottom-2 w-8 h-8 p-0 rounded-full" size="sm" aria-label="Send message" >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1"><span>Press Enter to send</span></span>
                <span className="flex items-center space-x-1"><span>Press microphone to speak</span></span>
            </div>
            {inputMessage.length > 100 && (<div><span>{inputMessage.length}</span>/2000</div>)}
        </div>
      </footer>
    </div>
  );
}
