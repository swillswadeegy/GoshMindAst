/**********************************************************************
 * routes.ts – Express + OpenAI Assistant (remembers context)
 *********************************************************************/
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { type ChatResponse, type Message } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

/* ------------ OpenAI ------------ */
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

/* ------------ Request schema ------------ */
const chatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string().optional(), // legacy single-turn
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.string().optional(), // may be missing from client
      })
    )
    .optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  /* POST /api/chat */
  app.post("/api/chat", async (req, res) => {
    try {
      /* ---------- parse ---------- */
      const { sessionId, message, messages } = chatRequestSchema.parse(req.body);
      if (!message && (!messages || !messages.length)) {
        return res.status(400).json({ message: "Need 'message' or 'messages'." });
      }

      const assistantId = process.env.OPENAI_ASSISTANT_ID;
      if (!assistantId) {
        return res.status(500).json({ message: "Assistant ID not set." });
      }

      /* ---------- fetch / create conversation ---------- */
      let conversation = await storage.getConversation(sessionId);
      if (!conversation) {
        conversation = await storage.createConversation({ sessionId, messages: [] });
      }

      /* ---------- build promptMessages ---------- */
      let promptMessages: Message[] =
        messages && messages.length
          ? messages
          : [
              {
                role: "user",
                content: message!,
                timestamp: new Date().toISOString(),
              },
            ];

      /* ensure each has a timestamp */
      promptMessages = promptMessages.map((m) => ({
        ...m,
        timestamp: m.timestamp ?? new Date().toISOString(),
      }));

      const updatedMessages = [...conversation.messages, ...promptMessages];

      /* ---------- OpenAI assistant call ---------- */
      const thread = await openai.beta.threads.create();
      for (const m of promptMessages) {
        await openai.beta.threads.messages.create(thread.id, {
          role: m.role,
          content: m.content,
        });
      }

      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistantId,
      });
      if (run.status !== "completed")
        throw new Error(`Assistant run failed: ${run.status}`);

      const threadMsgs = await openai.beta.threads.messages.list(thread.id);
      const assistantMsg = threadMsgs.data.find((m) => m.role === "assistant");
      if (
        !assistantMsg ||
        !assistantMsg.content[0] ||
        assistantMsg.content[0].type !== "text"
      )
        throw new Error("No assistant text found");

      const assistantText = assistantMsg.content[0].text.value;
      const assistantMessage: Message = {
        role: "assistant",
        content: assistantText,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      await storage.updateConversation(sessionId, finalMessages);

      const response: ChatResponse = { response: assistantText, sessionId };
      return res.json(response);
    } catch (err) {
      console.error("Chat error:", err);
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: "Invalid request", errors: err.errors });
      return res.status(500).json({ message: "Server error: " + (err as Error).message });
    }
  });

  /* GET /api/conversation/:sessionId */
  app.get("/api/conversation/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const conv = await storage.getConversation(sessionId);
      res.json({ messages: conv ? conv.messages : [] });
    } catch (err) {
      console.error("History error:", err);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  return createServer(app);
}
