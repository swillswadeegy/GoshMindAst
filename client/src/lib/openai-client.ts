/* client/src/lib/openai-client.ts
 * Simple client to hit your /api/chat and /api/conversation endpoints
 * using the updated "messages" payload.
 */
import { apiRequest } from "./queryClient";
import type { Message } from "@shared/schema";

/** what we send to /api/chat */
export interface ChatRequest {
  sessionId: string;
  messages: Message[];         // full prompt history (trimmed client-side)
}

/** what we expect back */
export interface ChatResponse {
  response: string;            // assistant text
}

/* POST one chat turn */
export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {
  const res = await apiRequest("POST", "/api/chat", request);
  return res.json();
}

/* GET history (if you still use it) */
export async function getConversationHistory(sessionId: string) {
  const res = await apiRequest("GET", `/api/conversation/${sessionId}`);
  return res.json();
}
