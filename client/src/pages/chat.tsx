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

/* ------------------------------------------------------------------ */
/*   Generate a session ID for this chat session                      */
/* ------------------------------------------------------------------ */
const SESSION_ID = `session_${Date.now()}_${Math.random()
  .toString(36)
  .substr(2, 9)}`;

export default function Chat() {
  /* ------------------------------- state -------------------------- */
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceInput, setIsVoiceInput] = useState(false); // can still drive UI if you want

  /* ------------- refs ------------- */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* NEW → keeps freshest “voice?” flag for async onSuccess */
  const lastInputWasVoiceRef = useRef(false);

  /* dynamic paddings */
  const [contentPaddingTop, setContentPaddingTop] = useState(0);
  const [contentPaddingBottom, setContentPaddingBottom] = useState(0);

  /* speech hook + toast */
  const { speak } = useSpeech();
  const { toast } = useToast();

  /* ---------------------- header / footer paddings ---------------- */
  useEffect(() => {
    const calc = () => {
      if (headerRef.current) setContentPaddingTop(headerRef.current.offsetHeight);
      if (footerRef.current) setContentPaddingBottom(footerRef.current.offsetHeight);
    };
    calc();
    window.addEventListener("resize", calc);

    let ro: ResizeObserver | undefined;
    if (footerRef.current) {
      ro = new ResizeObserver(calc);
      ro.observe(footerRef.current);
    }
    return () => {
      window.removeEventListener("resize", calc);
      ro?.disconnect();
    };
  }, []);

  /* ------------------------- history load ------------------------- */
  const { data: conversationData } = useQuery({
    queryKey: ["/api/conversation", SESSION_ID],
    queryFn: () => getConversationHistory(SESSION_ID),
    refetchOnMount: true,
  });

  useEffect(() => {
    if (conversationData?.messages) setMessages(conversationData.messages);
  }, [conversationData]);

  /* ------------------------- send message ------------------------- */
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

      /* -----------   auto-speak if the question was via voice ------- */
      if (lastInputWasVoiceRef.current) {
        speak(assistantMessage.content);
        lastInputWasVoiceRef.current = false; // reset
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

  /* --------------------- textarea auto-resize --------------------- */
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      const maxHeight = 128;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }
  };
  useEffect(() => autoResizeTextarea(), [inputMessage]);

  /* ------------------------ handlers ------------------------------ */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setInputMessage(e.target.value);

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

    sendMessageMutation.mutate({ message: messageContent, sessionId: SESSION_ID });

    /* >>> typed input → NO auto-speak on reply */
    lastInputWasVoiceRef.current = false;
    setIsVoiceInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    lastInputWasVoiceRef.current = true; // flag!
    setIsVoiceInput(true);

    if (!transcript.trim()) return;

    const userMessage: Message = {
      id: `user_voice_${Date.now()}`,
      role: "user",
      content: transcript,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    sendMessageMutation.mutate({ message: transcript, sessionId: SESSION_ID });
  };

  /* ------------------------ auto-scroll --------------------------- */
  useEffect(() => {
    const scrollToBottom = () =>
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    if (chatContainerRef.current && messagesEndRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const distance = scrollHeight - scrollTop - clientHeight;
      if (messages.length <= 2 || distance < 150) setTimeout(scrollToBottom, 0);
    }
  }, [messages]);

  /* ------------------------ focus mgmt ---------------------------- */
  useEffect(() => {
    if (textareaRef.current && !isVoiceInput) textareaRef.current.focus();
  }, [messages, isVoiceInput]);

  const showWelcome =
    messages.length === 0 &&
    !sendMessageMutation.isPending &&
    !conversationData;

  /* --------------------------- render ----------------------------- */
  return (
    <div className="flex flex-col min-h-screen max-w-4xl mx-auto bg-gray-50">
      {/* ---------- header ---------- */}
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

      {/* ---------- main ---------- */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ paddingTop: `${contentPaddingTop}px` }}
      >
        {showWelcome ? (
          /* … existing welcome screen … */
          <div
            className="flex-1 flex flex-col items-center justify-center p-4 text-center"
            style={{ paddingBottom: `${contentPaddingBottom}px` }}
          >
            {/* welcome content */}
          </div>
        ) : (
          /* ---- chat history ---- */
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
                  m.role === "assistant"
                    ? () => speak(m.content) // manual “tap-to-read” still works
                    : undefined
                }
              />
            ))}
            <div ref={messagesEndRef} />

            {/* typing indicator */}
            {sendMessageMutation.isPending && (
              /* … existing “Thinking…” bubble … */
              <div className="flex justify-start">
                {/* (kept unchanged) */}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ---------- footer ---------- */}
      <footer
        ref={footerRef}
        className="bg-white border-t border-gray-200 p-3 sm:p-4 sticky bottom-0 z-20"
      >
        <div className="flex items-end space-x-2 sm:space-x-3">
          {/* mic */}
          <VoiceInput
            onTranscript={handleVoiceTranscript}
            disabled={sendMessageMutation.isPending}
          />
          {/* text box + send */}
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
              disabled={
                !inputMessage.trim() || sendMessageMutation.isPending
              }
              className="absolute right-2 bottom-2 w-8 h-8 p-0 rounded-full"
              size="sm"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <span>Press Enter to send • Press microphone to begin a conversation. Press microphone again to stop listening</span>
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
