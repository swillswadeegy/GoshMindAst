/**********************************************************************
 *  routes.ts  –  Express + OpenAI Assistant with optional history
 *********************************************************************/
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { type ChatResponse, type Message } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

/* ------------------ OpenAI client ------------------ */
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

/* ------------------ Zod request schema ------------------ */
const chatRequestSchema = z.object({
  sessionId: z.string(),
  /** legacy single-turn field */
  message: z.string().optional(),
  /** new multi-turn field */
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  /* ────────────── POST /api/chat ────────────── */
  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message, messages } = chatRequestSchema.parse(req.body);

      if (!message && (!messages || !messages.length)) {
        return res
          .status(400)
          .json({ message: "Either 'message' or 'messages' is required." });
      }

      const assistantId = process.env.OPENAI_ASSISTANT_ID;
      if (!assistantId) {
        return res
          .status(500)
          .json({ message: "Assistant ID not configured." });
      }

      /* ---------- fetch / create conversation ---------- */
      let conversation = await storage.getConversation(sessionId);
      if (!conversation) {
        conversation = await storage.createConversation({
          sessionId,
          messages: [],
        });
      }

      /* ---------- decide current user turn & history ---------- */
      let promptMessages: Message[] = [];

      if (messages && messages.length) {
        // client sent full history (already trimmed)
        promptMessages = messages;
      } else if (message) {
        // fallback to single-turn
        const userMsg: Message = {
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        };
        promptMessages = [userMsg];
      }

      /* ---------- add to conversation for persistence ---------- */
      const updatedMessages = [...conversation.messages, ...promptMessages];

      /* ----------- create Assistant thread / run ----------- */
      const thread = await openai.beta.threads.create();

      // push all messages in order
      for (const m of promptMessages) {
        await openai.beta.threads.messages.create(thread.id, {
          role: m.role,
          content: m.content,
        });
      }

      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistantId,
      });

      if (run.status !== "completed") {
        throw new Error(`Assistant run failed: ${run.status}`);
      }

      /* ---------- get assistant reply ---------- */
      const threadMsgs = await openai.beta.threads.messages.list(thread.id);
      const assistantMsg = threadMsgs.data.find((m) => m.role === "assistant");

      if (
        !assistantMsg ||
        !assistantMsg.content[0] ||
        assistantMsg.content[0].type !== "text"
      ) {
        throw new Error("No valid assistant response found");
      }

      const assistantText = assistantMsg.content[0].text.value;

      const assistantMessage: Message = {
        role: "assistant",
        content: assistantText,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      await storage.updateConversation(sessionId, finalMessages);

      const response: ChatResponse = {
        response: assistantText,
        sessionId,
      };

      return res.json(response);
    } catch (error) {
      console.error("Chat error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      return res
        .status(500)
        .json({ message: "Failed to process chat request: " + (error as Error).message });
    }
  });

  /* ────────────── GET /api/conversation/:sessionId ────────────── */
  app.get("/api/conversation/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const conversation = await storage.getConversation(sessionId);
      res.json({ messages: conversation ? conversation.messages : [] });
    } catch (err) {
      console.error("Get conversation error:", err);
      res.status(500).json({ message: "Failed to retrieve conversation" });
    }
  });

  /* create & return HTTP server */
  return createServer(app);
}
