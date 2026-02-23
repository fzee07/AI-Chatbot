// ============================================================
// Chat Service — THE CORE ENGINE
// ============================================================
// This is the HEART of the application. Everything comes together here:
//   - Short-term memory (recent messages from MongoDB)
//   - Long-term memory (RAG from Pinecone)
//   - Streaming responses (SSE)
//   - Role-based system prompts
//
// Flow for every message:
//   1. Get short-term context (last 20 messages from MongoDB)
//   2. Search long-term memory (relevant past conversations from Pinecone)
//   3. Build the prompt with system instruction + memory + context
//   4. Send to Gemini (streaming or non-streaming)
//   5. Save both user message and AI response to MongoDB
//   6. If messages > 20, archive old ones to Vector DB (background)
//
// THIS FILE CONTAINS:
//   - System prompts (role-based AI personalities)
//   - Conversation CRUD operations (create, list, get, delete)
//   - buildContext() — combines short-term + long-term memory
//   - sendMessage() — non-streaming response (returns full JSON)
//   - sendMessageStream() — streaming response via SSE (real-time chunks)
// ============================================================

import { Response } from "express";
import ai, { CHAT_MODEL } from "../../config/gemini";
import Conversation from "./conversation.model";
import Message from "./message.model";
import { ChatRole, IConversation, IMessage } from "../../types";
import {
  archiveToLongTermMemory,
  searchLongTermMemory,
  getShortTermContext,
} from "./memory.service";

// ── System Prompts (Role-Based AI Personalities) ─────────────
// Each role gets a different "system prompt" — instructions that
// tell the AI HOW to behave and respond.
//
// This is "Prompt Engineering" — same AI model, different instructions.
// It's like giving the same actor different scripts to play different characters.
//
// IMPORTANT: Each prompt includes a line about using previous conversation
// context "naturally" — this is how long-term memory feels seamless.
// The AI doesn't say "I remember you asked about X" — it just uses the knowledge.

const SYSTEM_PROMPTS: Record<ChatRole, string> = {
  assistant: `You are a helpful, friendly AI assistant. You provide clear,
accurate answers and help users with a wide range of tasks. Be conversational
but informative. If you have context from previous conversations, use it
naturally without explicitly mentioning you're "recalling" things.`,

  coder: `You are an expert software developer and programming mentor.
You write clean, well-commented code and explain concepts clearly.
Always provide code examples when relevant. Use markdown code blocks
with language tags. Suggest best practices and potential improvements.
If you have context from previous conversations about the user's tech
stack or projects, reference them naturally.`,

  teacher: `You are a patient, encouraging teacher who excels at breaking
down complex topics into simple, understandable pieces. Use analogies,
examples, and step-by-step explanations. Check understanding by asking
follow-up questions. Adapt your explanations based on the user's level.
If you have context from previous conversations about what the user is
learning, build upon that naturally.`,

  creative: `You are a creative writing partner with a vivid imagination.
You help with storytelling, brainstorming, creative writing, and artistic
ideas. Your responses are engaging, descriptive, and inspiring. You can
write in various styles and tones. If you have context from previous
creative projects or preferences, incorporate them naturally.`,
};

// ── Conversation CRUD Operations ─────────────────────────────
// Basic Create/Read/Delete operations for conversations.
// These are straightforward MongoDB operations using Mongoose.

/**
 * Create a new conversation for a user.
 * Default title is "New Conversation" and default role is "assistant".
 */
export const createConversation = async (
  userId: string,
  title: string = "New Conversation",
  chatRole: ChatRole = "assistant"
): Promise<IConversation> => {
  return Conversation.create({ user: userId, title, chatRole });
};

/**
 * Get all conversations for a user, sorted by most recent activity.
 * .select("-__v") removes the Mongoose version key from the response.
 */
export const getUserConversations = async (userId: string) => {
  return Conversation.find({ user: userId })
    .sort({ lastActivity: -1 }) // Most recent first
    .select("-__v");
};

/**
 * Get a single conversation, verifying the user owns it.
 * This is an OWNERSHIP CHECK — users can only access their own conversations.
 * Both _id AND user must match, preventing unauthorized access.
 */
export const getConversationById = async (
  conversationId: string,
  userId: string
) => {
  const conv = await Conversation.findOne({
    _id: conversationId,
    user: userId, // SECURITY: Ensures the requesting user owns this conversation
  });
  if (!conv) throw new Error("Conversation not found");
  return conv;
};

/**
 * Delete a conversation and ALL its messages.
 * First verifies ownership, then deletes messages, then the conversation.
 * Order matters: delete children (messages) before parent (conversation).
 */
export const deleteConversation = async (
  conversationId: string,
  userId: string
): Promise<void> => {
  const conv = await Conversation.findOne({
    _id: conversationId,
    user: userId,
  });
  if (!conv) throw new Error("Conversation not found");

  // Delete all messages first (children), then the conversation (parent)
  await Message.deleteMany({ conversation: conversationId });
  await Conversation.deleteOne({ _id: conversationId });
};

/**
 * Get all messages in a conversation (for loading chat history in the UI).
 * Sorted by timestamp (oldest first) so messages display in correct order.
 */
export const getConversationMessages = async (
  conversationId: string,
  userId: string
) => {
  // Verify ownership first — throws if user doesn't own this conversation
  await getConversationById(conversationId, userId);

  return Message.find({ conversation: conversationId })
    .sort({ timestamp: 1 }) // Oldest first (chronological order)
    .select("role content timestamp"); // Only return needed fields
};

// ── Build Context for Gemini ─────────────────────────────────

/**
 * Build the full context that gets sent to Gemini.
 * This is where SHORT-TERM + LONG-TERM memory combine.
 *
 * WHAT GETS SENT TO GEMINI:
 *   1. System Instruction: The role-based personality prompt
 *      + any relevant long-term memories appended to it
 *   2. Conversation History: The last 20 messages formatted for Gemini
 *
 * GEMINI'S MESSAGE FORMAT:
 *   Gemini expects messages as:
 *   { role: "user" | "model", parts: [{ text: "..." }] }
 *
 *   This is different from OpenAI which uses:
 *   { role: "user" | "assistant", content: "..." }
 */
const buildContext = async (
  conversationId: string,
  userId: string,
  newMessage: string,
  chatRole: ChatRole
) => {
  // Step 1: Get short-term context (recent messages from MongoDB)
  const recentMessages = await getShortTermContext(conversationId);

  // Step 2: Search long-term memory (relevant past conversations from Pinecone)
  // The new message is used as the search query — find past conversations
  // that are semantically similar to what the user is asking NOW
  const longTermMemories = await searchLongTermMemory(newMessage, userId);

  // Step 3: Build the system instruction (role prompt + optional memory context)
  let systemInstruction = SYSTEM_PROMPTS[chatRole];

  // If we found relevant long-term memories, INJECT them into the system prompt
  // This is the "Augmented" part of RAG — we augment the prompt with retrieved data
  if (longTermMemories.length > 0) {
    const memoryContext = longTermMemories.map((m) => m.text).join("\n---\n");

    // Tell the AI to use this context naturally (not "I remember...")
    systemInstruction += `\n\nYou have the following context from previous
conversations with this user. Use this information naturally if relevant,
but don't explicitly say "I remember from our previous conversation" — just
use the knowledge as if you naturally know it:\n\n${memoryContext}`;
  }

  // Step 4: Format recent messages for Gemini's expected format
  // Gemini expects: { role: "user" | "model", parts: [{ text: "..." }] }
  const formattedHistory = recentMessages.map((msg: any) => ({
    role: msg.role as "user" | "model",
    parts: [{ text: msg.content }],
  }));

  return { systemInstruction, formattedHistory };
};

// ── Send Message (Non-Streaming) ─────────────────────────────

/**
 * Send a message and wait for the COMPLETE AI response.
 *
 * This is the simpler approach — the client waits until the full
 * response is ready, then receives it all at once as JSON.
 *
 * PROS: Simple to implement, easy to parse on client side
 * CONS: User waits 3-10 seconds staring at a loading spinner
 *
 * Used when: { stream: false } in the request body (default)
 */
export const sendMessage = async (
  conversationId: string,
  userId: string,
  userMessage: string
): Promise<{ userMsg: IMessage; aiMsg: IMessage }> => {
  // Verify the user owns this conversation (throws 404 if not)
  const conversation = await getConversationById(conversationId, userId);

  // Save the user's message to MongoDB FIRST (before AI responds)
  const userMsg = await Message.create({
    conversation: conversationId,
    role: "user",
    content: userMessage,
  });

  // Build context: combine short-term (recent messages) + long-term (RAG) memory
  const { systemInstruction, formattedHistory } = await buildContext(
    conversationId,
    userId,
    userMessage,
    conversation.chatRole as ChatRole
  );

  // Add the NEW user message to the formatted history
  // (it wasn't in short-term context yet since we just saved it)
  formattedHistory.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  // Call Gemini and wait for the FULL response
  // generateContent() returns only after the entire response is generated
  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: formattedHistory, // The conversation history
    config: {
      systemInstruction, // The AI's personality + memory context
      temperature: 0.7, // Creativity level: 0 = deterministic, 1 = creative
    },
  });

  const aiContent = response.text || "I apologize, I could not generate a response.";

  // Save the AI's response to MongoDB
  const aiMsg = await Message.create({
    conversation: conversationId,
    role: "model",
    content: aiContent,
  });

  // Update conversation metadata (message count + last activity timestamp)
  await Conversation.findByIdAndUpdate(conversationId, {
    messageCount: (conversation.messageCount || 0) + 2, // +2 for user msg + AI msg
    lastActivity: new Date(),
  });

  // Check if we need to archive old messages to long-term memory
  const totalMessages = (conversation.messageCount || 0) + 2;
  if (totalMessages > 20) {
    // Archive in BACKGROUND — don't await it, don't slow down the response
    // .catch() prevents unhandled promise rejection if archiving fails
    archiveToLongTermMemory(conversationId, userId).catch((err) =>
      console.error("[Memory] Background archive failed:", err.message)
    );
  }

  return { userMsg, aiMsg };
};

// ── Send Message (Streaming via SSE) ─────────────────────────

/**
 * Send a message with STREAMING response using Server-Sent Events (SSE).
 *
 * THIS IS THE KEY UX FEATURE — STREAMING:
 *
 * Without streaming (traditional):
 *   Client sends message → Server waits 5-10 seconds → Sends full response
 *   (User stares at loading spinner, wondering if it's working)
 *
 * With streaming (SSE):
 *   Client sends message → Server sends words AS THEY'RE GENERATED
 *   (User sees text appearing word-by-word, like ChatGPT)
 *
 * HOW SSE (Server-Sent Events) WORKS:
 *   1. Server sets special headers: Content-Type: text/event-stream
 *   2. Connection stays OPEN (doesn't close after first response)
 *   3. Server calls res.write() for each chunk of text
 *   4. When done, server calls res.end() to close connection
 *   5. Each chunk follows the SSE format: "data: {json}\n\n"
 *
 * WHY "data:" PREFIX?
 *   It's the SSE protocol standard. The browser's EventSource API expects:
 *   - "data:" prefix → means "here's a chunk of data"
 *   - "\n\n" (double newline) → means "end of this event"
 *
 * EVENT TYPES WE SEND:
 *   { type: "chunk", content: "Hello" }  → a piece of the response
 *   { type: "done", messageId, fullContent }  → streaming complete
 *   { type: "error", message }  → something went wrong
 *
 * Used when: { stream: true } in the request body
 */
export const sendMessageStream = async (
  conversationId: string,
  userId: string,
  userMessage: string,
  res: Response
): Promise<void> => {
  // Verify the user owns this conversation
  const conversation = await getConversationById(conversationId, userId);

  // Save user message to MongoDB (same as non-streaming)
  await Message.create({
    conversation: conversationId,
    role: "user",
    content: userMessage,
  });

  // Build context (same as non-streaming — short-term + long-term memory)
  const { systemInstruction, formattedHistory } = await buildContext(
    conversationId,
    userId,
    userMessage,
    conversation.chatRole as ChatRole
  );

  // Add the new user message to history
  formattedHistory.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  // ── SET UP SSE HEADERS ──
  // These headers tell the browser/client:
  // "Keep this connection open, I'll keep sending you data"
  res.setHeader("Content-Type", "text/event-stream"); // SSE content type
  res.setHeader("Cache-Control", "no-cache"); // Don't cache streaming data
  res.setHeader("Connection", "keep-alive"); // Keep TCP connection open
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering (for production)
  res.flushHeaders(); // Send headers IMMEDIATELY (don't wait for body)

  // Accumulate the full response as chunks arrive
  let fullResponse = "";

  try {
    // ── STREAMING CALL TO GEMINI ──
    // generateContentStream() returns an async iterable (like a stream of data)
    // Instead of waiting for the full response, it yields chunks as they're generated
    const stream = await ai.models.generateContentStream({
      model: CHAT_MODEL,
      contents: formattedHistory,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    // ── SEND CHUNKS AS THEY ARRIVE ──
    // `for await...of` iterates over async data as it becomes available
    // Each `chunk` contains a small piece of the AI's response
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text; // Accumulate for saving to DB later

        // Send this chunk to the client via SSE protocol
        // Format: "data: {json}\n\n" — the browser's EventSource API parses this
        res.write(`data: ${JSON.stringify({ type: "chunk", content: text })}\n\n`);
      }
    }

    // ── ALL CHUNKS SENT — NOW SAVE THE COMPLETE RESPONSE ──
    const aiMsg = await Message.create({
      conversation: conversationId,
      role: "model",
      content: fullResponse,
    });

    // Send a "done" event so the client knows streaming is complete
    // Include the full content and message ID for the client to use
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        messageId: aiMsg._id,
        fullContent: fullResponse,
      })}\n\n`
    );

    // Update conversation metadata
    await Conversation.findByIdAndUpdate(conversationId, {
      messageCount: (conversation.messageCount || 0) + 2,
      lastActivity: new Date(),
    });

    // Archive to long-term memory if needed (background, non-blocking)
    const totalMessages = (conversation.messageCount || 0) + 2;
    if (totalMessages > 20) {
      archiveToLongTermMemory(conversationId, userId).catch((err) =>
        console.error("[Memory] Background archive failed:", err.message)
      );
    }
  } catch (error: any) {
    // Send error as an SSE event (client can display it in the chat)
    res.write(
      `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
    );
  } finally {
    // ALWAYS close the SSE connection when done (success or error)
    res.end();
  }
};
