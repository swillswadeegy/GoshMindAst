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

// Generate a session ID for this chat session
const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default function Chat() {
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceInput, setIsVoiceInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [contentPaddingTop, setContentPaddingTop] = useState(0);
  const [contentPaddingBottom, setContentPaddingBottom] = useState(0);

  const { speak } = useSpeech();
  const { toast } = useToast();

  useEffect(() => {
    const calculatePaddings = () => {
      if (headerRef.current) {
        setContentPaddingTop(headerRef.current.offsetHeight);
      }
      if (footerRef.current) {
        setContentPaddingBottom(footerRef.current.offsetHeight);
      }
    };

    calculatePaddings();
    window.addEventListener('resize', calculatePaddings);

    let footerResizeObserver: ResizeObserver | undefined;
    if (footerRef.current) {
      footerResizeObserver = new ResizeObserver(calculatePaddings);
      footerResizeObserver.observe(footerRef.current);
    }

    return () => {
      window.removeEventListener('resize', calculatePaddings);
      if (footerResizeObserver && footerRef.current) {
        footerResizeObserver.unobserve(footerRef.current);
      }
    };
  }, []);

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
      // Add your auto-speak logic for mobile here if you have useMobile hook
      // const isMobile = useMobile(); // Example
      // if (isMobile) { speak(response.response); }
      queryClient.invalidateQueries({ 
        queryKey: ['/api/conversation', SESSION_ID] 
      });
    },
    onError: (error) => {
      console.error("Send message error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      const maxHeight = 128; // From max-h-32
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      // No need to call setContentPaddingBottom here directly if ResizeObserver on footer is active
    }
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [inputMessage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
  };

  const handleSendMessage = () => {
    const messageContent = inputMessage.trim();
    if (!messageContent || sendMessageMutation.isPending) return;
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
      const userMessage: Message = {
        id: `user_voice_${Date.now()}`,
        role: "user",
        content: transcript,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      sendMessageMutation.mutate({ message: transcript, sessionId: SESSION_ID });
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (messages.length <= 2 || isScrolledToBottom) {
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 0);
      }
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current && !isVoiceInput) {
      textareaRef.current.focus();
    }
  }, [messages, isVoiceInput]);

  const showWelcome = messages.length === 0 && !sendMessageMutation.isPending;

  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      <header ref={headerRef} className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 sm:py-4 sticky top-0 z-20">
        <div className="flex items-center justify-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Policy Bot</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden" 
            style={{ paddingTop: `${contentPaddingTop}px` }}>
        {showWelcome ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center" 
               style={{ paddingBottom: `${contentPaddingBottom}px` }}>
            <div className="max-w-md">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                Welcome to Policy Bot
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed">
                Start a conversation by typing a message or using voice input. 
                I'm here to help with any questions related to local trust policy. This is a beta version. Please double check results against the policy referenced in the response.
              </p>
            </div>
          </div>
        ) : (
          <div 
            ref={chatContainerRef}
            className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto" // Keep existing px-4 and pb-4 for base padding within scroll area
            style={{ paddingBottom: `${contentPaddingBottom}px` }} 
          >
            {messages.map((message) => (
              <ChatMessage
                key={message.id || message.timestamp} 
                message={message}
                onSpeak={message.role === "assistant" ? () => speak(message.content) : undefined}
              />
            ))}
            
            {/* --- CORRECTED LOADING INDICATOR PLACEMENT --- */}
            {sendMessageMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <Brain className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <span className="text-xs text-slate-500">Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* --- END OF CORRECTION --- */}
          </div>
        )}
      </main>

      <footer ref={footerRef} className="bg-white border-t border-gray-200 p-3 sm:p-4 sticky bottom-0 z-20">
        <div className="flex items-end space-x-2 sm:space-x-3">
          <div className="relative flex-shrink-0">
            <VoiceInput 
              onTranscript={handleVoiceTranscript}
              disabled={sendMessageMutation.isPending}
            />
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
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sendMessageMutation.isPending}
              className="absolute right-2 bottom-2 w-8 h-8 p-0 rounded-full"
              size="sm"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <span>Press Enter to send</span>
            </span>
            <span className="flex items-center space-x-1">
              <span>Press microphone to speak</span>
            </span>
          </div>
          {inputMessage.length > 100 && (
            <div>
              <span>{inputMessage.length}</span>/2000
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
