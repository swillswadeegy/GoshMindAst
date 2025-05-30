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
  const { speak } = useSpeech();
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
        role: "assistant",
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Only speak the response if it was triggered by voice input
      if (isVoiceInput) {
        speak(response.response);
      }
      
      // Invalidate and refetch conversation history
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
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    autoResizeTextarea();
  };

  // Handle send message
  const handleSendMessage = () => {
    const message = inputMessage.trim();
    if (!message || sendMessageMutation.isPending) return;

    // Add user message immediately
    const userMessage: Message = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Send to API
    sendMessageMutation.mutate({
      message,
      sessionId: SESSION_ID,
    });
    
    // Reset voice input flag for text messages
    setIsVoiceInput(false);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle voice transcript
  const handleVoiceTranscript = (transcript: string) => {
    setInputMessage(transcript);
    setIsVoiceInput(true);
    // Auto-send voice messages
    setTimeout(() => {
      if (transcript.trim()) {
        const userMessage: Message = {
          role: "user",
          content: transcript,
          timestamp: new Date().toISOString(),
        };
        
        setMessages(prev => [...prev, userMessage]);
        setInputMessage("");
        
        sendMessageMutation.mutate({
          message: transcript,
          sessionId: SESSION_ID,
        });
      }
    }, 100);
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Initial focus
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-6">
        <div className="flex items-center justify-center">
          <h1 className="text-4xl font-bold text-slate-800 tracking-tight">Policy Bot</h1>
        </div>
      </header>

      {/* Chat Container */}
      <main className="flex-1 flex flex-col">
        {/* Welcome Message */}
        {showWelcome && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center max-w-md">
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
        )}

        {/* Chat Messages */}
        {!showWelcome && (
          <div 
            ref={chatContainerRef}
            className="flex-1 px-4 py-4 space-y-4 overflow-y-auto"
          >
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                message={message}
                onSpeak={message.role === "assistant" ? speak : undefined}
              />
            ))}
            
            {/* Loading indicator */}
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
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-gray-200 p-4">
        <div className="flex items-end space-x-3">
          {/* Voice Input Button */}
          <div className="relative flex-shrink-0">
            <VoiceInput 
              onTranscript={handleVoiceTranscript}
              disabled={sendMessageMutation.isPending}
            />
          </div>

          {/* Text Input */}
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message here..."
              className="resize-none rounded-2xl border border-gray-300 px-4 py-3 pr-12 focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm max-h-32 min-h-[48px]"
              rows={1}
              disabled={sendMessageMutation.isPending}
            />
            
            {/* Send Button */}
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sendMessageMutation.isPending}
              className="absolute right-2 bottom-2 w-8 h-8 p-0 rounded-full"
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Input Helpers */}
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
