/* client/src/pages/chat.tsx */
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

/* session id */
const SESSION_ID = `session_${Date.now()}_${Math.random()
  .toString(36)
  .substr(2, 9)}`;

export default function Chat() {
  /* ---------------- state ---------------- */
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceInput, setIsVoiceInput] = useState(false);
  const [isThinking, setIsThinking] = useState(false);          // ← NEW

  /* refs */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastInputWasVoiceRef = useRef(false);

  /* paddings */
  const [contentPaddingTop, setContentPaddingTop] = useState(0);
  const [contentPaddingBottom, setContentPaddingBottom] = useState(0);

  const { speak } = useSpeech();
  const { toast } = useToast();

  /* header / footer height calc … (unchanged) */

  /* history load … (unchanged) */

  /* ------------ send message mutation ------------- */
  const sendMessageMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      /* speak only if last turn was voice */
      if (lastInputWasVoiceRef.current) {
        speak(assistantMessage.content);
        lastInputWasVoiceRef.current = false;
      }

      setIsThinking(false);                     // ← NEW
      queryClient.invalidateQueries({
        queryKey: ["/api/conversation", SESSION_ID],
      });
    },
    onError: (error) => {
      console.error("Send message error:", error);
      setIsThinking(false);                     // ← NEW
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  /* textarea auto-resize … (unchanged) */

  /* ------------- handlers ------------- */
  const handleSendMessage = () => {
    const messageContent = inputMessage.trim();
    if (!messageContent || sendMessageMutation.isPending) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    textareaRef.current && (textareaRef.current.style.height = "auto");

    setIsThinking(true);                        // ← NEW
    sendMessageMutation.mutate({
      message: messageContent,
      sessionId: SESSION_ID,
    });

    lastInputWasVoiceRef.current = false;
    setIsVoiceInput(false);
  };

  const handleVoiceTranscript = (transcript: string) => {
    if (!transcript.trim()) return;

    lastInputWasVoiceRef.current = true;
    setIsVoiceInput(true);

    const userMessage: Message = {
      id: `user_voice_${Date.now()}`,
      role: "user",
      content: transcript,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsThinking(true);                        // ← NEW
    sendMessageMutation.mutate({
      message: transcript,
      sessionId: SESSION_ID,
    });
  };

  /* auto-scroll, focus mgmt, etc. … (unchanged) */

  /* ---------------- JSX ---------------- */
  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      {/* header … (unchanged) */}

      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ paddingTop: `${contentPaddingTop}px` }}
      >
        {/* welcome block unchanged */}

        <div
          ref={chatContainerRef}
          className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto"
          style={{ paddingBottom: `${Math.max(16, contentPaddingBottom)}px` }}
        >
          {messages.map((m) => (
            <ChatMessage
              key={m.id || m.timestamp}
              message={m}
              onSpeak={
                m.role === "assistant" ? () => speak(m.content) : undefined
              }
            />
          ))}

          {/* “Thinking…” bubble */}
          {isThinking && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-slate-600" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                    <span className="text-xs text-slate-500">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* footer … (unchanged) */}
    </div>
  );
}
