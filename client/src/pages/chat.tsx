/* client/src/pages/chat.tsx
 * Front-end chat page – now sends the last 5 turns every time.
 */
import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Brain } from "lucide-react";
import { ChatMessage } from "@/components/chat-message";
import { VoiceInput } from "@/components/voice-input";
import { useSpeech } from "@/hooks/use-speech";
import {
  sendChatMessage,
  getConversationHistory,
  ChatRequest,
  ChatResponse,
} from "@/lib/openai-client";
import { useToast } from "@/hooks/use-toast";
import type { Message } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

/* session id */
const SESSION_ID = `session_${Date.now()}_${Math.random()
  .toString(36)
  .substr(2, 9)}`;

/* ---- how many past turns to keep ---- */
const MAX_TURNS = 5; // = 10 messages (user+bot pairs)

/* helper: return last N turns (=> 2N messages) */
const lastTurns = (msgs: Message[], nTurns: number) => {
  // filter only user/assistant (skip possible system entries)
  const chatOnly = msgs.filter(
    (m) => m.role === "user" || m.role === "assistant"
  );
  return chatOnly.slice(-nTurns * 2);
};

export default function Chat() {
  /* ------------ state ------------ */
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceInput, setIsVoiceInput] = useState(false);

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

  /* header / footer height calc (unchanged) */
  useEffect(() => {
    const calc = () => {
      if (headerRef.current) setContentPaddingTop(headerRef.current.offsetHeight);
      if (footerRef.current) setContentPaddingBottom(footerRef.current.offsetHeight);
    };
    calc();
    window.addEventListener("resize", calc);
    const ro = footerRef.current ? new ResizeObserver(calc) : undefined;
    ro?.observe(footerRef.current as Element);
    return () => {
      window.removeEventListener("resize", calc);
      ro?.disconnect();
    };
  }, []);

  /* history load (unchanged) */
  const { data: conversationData } = useQuery({
    queryKey: ["/api/conversation", SESSION_ID],
    queryFn: () => getConversationHistory(SESSION_ID),
    refetchOnMount: true,
  });
  useEffect(() => {
    if (conversationData?.messages) setMessages(conversationData.messages);
  }, [conversationData]);

  /* send message mutation – now typed */
  const sendMessageMutation = useMutation<
    ChatResponse,
    Error,
    ChatRequest
  >({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (lastInputWasVoiceRef.current) {
        speak(assistantMessage.content);
        lastInputWasVoiceRef.current = false;
      }

      queryClient.invalidateQueries({
        queryKey: ["/api/conversation", SESSION_ID],
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

  /* textarea auto-resize (unchanged) */
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  };
  useEffect(() => autoResizeTextarea(), [inputMessage]);

  /* ------------- handlers ------------- */
  const sendWithHistory = (userText: string) => {
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    /* slice history AFTER adding new user turn */
    const history = lastTurns([...messages, userMessage], MAX_TURNS);

    sendMessageMutation.mutate({
      sessionId: SESSION_ID,
      messages: history,
    });
  };

  const handleSendMessage = () => {
    const text = inputMessage.trim();
    if (!text || sendMessageMutation.isPending) return;
    setInputMessage("");
    textareaRef.current && (textareaRef.current.style.height = "auto");
    lastInputWasVoiceRef.current = false;
    setIsVoiceInput(false);
    sendWithHistory(text);
  };

  const handleVoiceTranscript = (transcript: string) => {
    if (!transcript.trim()) return;
    lastInputWasVoiceRef.current = true;
    setIsVoiceInput(true);
    sendWithHistory(transcript);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /* auto-scroll (unchanged) */
  useEffect(() => {
    const scroll = () =>
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (chatContainerRef.current && messagesEndRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (messages.length <= 2 || scrollHeight - scrollTop - clientHeight < 150)
        setTimeout(scroll, 0);
    }
  }, [messages]);

  /* focus (unchanged) */
  useEffect(() => {
    if (textareaRef.current && !isVoiceInput) textareaRef.current.focus();
  }, [messages, isVoiceInput]);

  const showWelcome =
    messages.length === 0 &&
    !sendMessageMutation.isPending &&
    !conversationData;

  /* --------------- render --------------- */
  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      {/* header – unchanged */}
      <header
        ref={headerRef}
        className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 sm:py-4 sticky top-0 z-20"
      >
        <div className="flex items-center justify-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
            Policy Bot
          </h1>
        </div>
      </header>

      {/* main chat area – unchanged except msgs now include markdown */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ paddingTop: `${contentPaddingTop}px` }}
      >
        {showWelcome ? (
          <div
            className="flex-1 flex flex-col items-center justify-center p-4 text-center"
            style={{ paddingBottom: `${contentPaddingBottom}px` }}
          >
            {/* welcome content */}
          </div>
        ) : (
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

            <div ref={messagesEndRef} />

            {sendMessageMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <Brain className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                        <div
                          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        />
                        <div
                          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        />
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

      {/* footer – unchanged */}
      <footer
        ref={footerRef}
        className="bg-white border-t border-gray-200 p-3 sm:p-4 sticky bottom-0 z-20"
      >
        <div className="flex items-end space-x-2 sm:space-x-3">
          <VoiceInput
            onTranscript={handleVoiceTranscript}
            disabled={sendMessageMutation.isPending}
          />
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
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
          <span>Press Enter to send • Press microphone to speak</span>
          {inputMessage.length > 100 && (
            <span>
              {inputMessage.length}
              /2000
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
