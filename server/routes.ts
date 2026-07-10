/**********************************************************************
 * routes.ts – Express + OpenAI Responses API (file_search via vector store)
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

/* ------------ GOSH policy system prompt ------------ */
const SYSTEM_PROMPT =
  process.env.OPENAI_SYSTEM_PROMPT ||
  `You are a knowledgeable and helpful assistant for Great Ormond Street Hospital (GOSH) staff. \
Your role is to help staff find and understand GOSH policies, guidelines, and procedures.

STRICT GROUNDING RULES — you must follow these without exception:
1. SYNTHESISE only: base every answer exclusively on the documents retrieved by the file_search tool. \
Do not add information from your general training knowledge.
2. NO SPECULATION: if the retrieved documents do not contain enough information to answer the question \
fully, say so explicitly rather than guessing or inferring.
3. NOT FOUND rule: if the answer cannot be found in the retrieved documents, respond with \
"Not Found in current GOSH policy documents" and suggest the staff member contacts the relevant department.
4. MANDATORY CITATIONS: every factual claim must be followed by a citation identifying the source \
document and, where available, the section or page number (e.g. [Policy Name, Section 3.2]).
5. UK ENGLISH: use British spelling and terminology throughout (e.g. "organisation", "colour", "theatre").
6. PROFESSIONAL TONE: maintain a clear, concise, and professional tone appropriate for clinical and \
administrative staff.`;

/* ------------ Vector store ID ------------ */
const VECTOR_STORE_ID =
  process.env.OPENAI_FILE_ID || "vs_6837a69465748191a9a3deef54538a25";

/* ------------ Request schema ------------ */
const chatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string().optional(), // legacy single-turn
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.string().optional(),
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

      /* add timestamp if missing */
      promptMessages = promptMessages.map((m) => ({
        ...m,
        timestamp: m.timestamp ?? new Date().toISOString(),
      }));

      /* ---------- persist ONLY the newest user message ---------- */
      let updatedMessages = conversation.messages;
      const newest = promptMessages[promptMessages.length - 1];
      if (newest.role === "user") {
        updatedMessages = [...conversation.messages, newest];
      }

      /* ---------- OpenAI Responses API call (file_search via vector store) ---------- */
      const openaiResponse = await openai.responses.create({
        model: "gpt-4o",
        instructions: SYSTEM_PROMPT,
        input: promptMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        tools: [
          {
            type: "file_search" as const,
            vector_store_ids: [VECTOR_STORE_ID],
          },
        ],
      });

      const assistantText = openaiResponse.output_text;
      if (!assistantText) {
        throw new Error("No assistant text found in response");
      }

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
      if (err instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid request", errors: err.errors });
      }
      return res
        .status(500)
        .json({ message: "Server error: " + (err as Error).message });
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
