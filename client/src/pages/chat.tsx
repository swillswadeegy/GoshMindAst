import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Brain } from "lucide-react";
import { ChatMessage } from "@/components/chat-message"; // Assuming this is your component for individual messages
import { VoiceInput } from "@/components/voice-input";   // Assuming this is your voice input component
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
  const { speak } = useSpeech(); // Assuming useSpeech provides the speak function
  const { toast } = useToast();

  // Load conversation history
  const { data: conversationData } = useQuery({
    queryKey: ['/api/conversation', SESSION_ID],
    queryFn: () => getConversationHistory(SESSION_ID),
    refetchOnMount: true,
  });

  // Update messages when conversation data loads
  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages);
    }
  }, [conversationData]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      const assistantMessage: Message = {
        // Ensure your Message type has an 'id' or use a suitable key for React lists
        id: `assistant_${Date.now()}`, // Example ID
        role: "assistant",
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // This is the logic you might have for auto-speaking on mobile
      // const isMobile = /* ... your useMobile() hook result ... */ false; // Get this from your useMobile hook
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
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-resize textarea
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px'; // max-h-32 is 128px
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    autoResizeTextarea();
  };

  const handleSendMessage = () => {
    const messageContent = inputMessage.trim();
    if (!messageContent || sendMessageMutation.isPending) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`, // Example ID
      role: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    sendMessageMutation.mutate({
      message: messageContent,
      sessionId: SESSION_ID,
    });
    
    setIsVoiceInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    // No need to setInputMessage(transcript) if it auto-sends
    // setInputMessage(transcript); 
    setIsVoiceInput(true); 
    
    setTimeout(() => { // setTimeout might not be necessary unless there's a reason for delay
      if (transcript.trim()) {
        const userMessage: Message = {
          id: `user_voice_${Date.now()}`, // Example ID
          role: "user",
          content: transcript,
          timestamp: new Date().toISOString(),
        };
        
        setMessages(prev => [...prev, userMessage]);
        // setInputMessage(""); // Not needed if inputMessage wasn't set from transcript

        sendMessageMutation.mutate({
          message: transcript,
          sessionId: SESSION_ID,
        });
      }
    }, 100); // Consider if this 100ms delay is needed
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const showWelcome = messages.length === 0 && !sendMessageMutation.isPending; // Also hide welcome if initial fetch is pending

  return (
    // Outermost container: Full height, flex column, centered on wider screens
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      {/* Header: Sticky at the top */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 sm:py-4 sticky top-0 z-20"> {/* Adjusted padding, added z-index */}
        <div className="flex items-center justify-center">
          {/* Consider making the font size responsive if needed */}
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Policy Bot</h1>
        </div>
      </header>

      {/* Main Chat Area: Takes remaining space and scrolls internally */}
      <main className="flex-1 flex flex-col overflow-hidden"> {/* Added overflow-hidden here */}
        {showWelcome ? (
          // Welcome Message Container: Now also flex-1 to fill <main>, content centered within
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center"> {/* MODIFIED */}
            <div className="max-w-md"> {/* Constrain width of text block */}
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
          // Chat Messages List: Grows and scrolls
          <div 
            ref={chatContainerRef}
            className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" // This is already good
          >
            {messages.map((message) => ( // Use message.id if available and unique
              <ChatMessage
                key={message.id || message.timestamp} // Prefer a stable unique ID
                message={message}
                onSpeak={message.role === "assistant" ? () => speak(message.content) : undefined}
              />
            ))}
            
            {sendMessageMutation.isPending && (
              // ... (your loading indicator - looks fine) ...
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
          </div>
        )}
      </main>

      {/* Input Area: Sticky at the bottom */}
      <footer className="bg-white border-t border-gray-200 p-3 sm:p-4 sticky bottom-0 z-20"> {/* Adjusted padding, added z-index */}
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
              placeholder="Type your message..." // Shortened placeholder
              className="resize-none rounded-2xl border-gray-300 px-4 py-3 pr-12 focus:border-primary focus:ring-primary/50 text-sm max-h-32 min-h-[48px] w-full" // Ensure w-full
              rows={1}
              disabled={sendMessageMutation.isPending}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sendMessageMutation.isPending}
              className="absolute right-2 bottom-2 w-8 h-8 p-0 rounded-full" // Adjusted positioning slightly if needed
              size="sm"
              aria-label="Send message" // Added aria-label for accessibility
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* Removed input helpers for brevity in this example, you can keep them */}
      </footer>
    </div>
  );
}
