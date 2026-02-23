// ============================================================
// Chat Service — THE CORE ENGINE
// ============================================================
// This ties everything together:
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
//   6. If messages > 20, archive old ones to Vector DB
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

// ── System Prompts (Role-Based Responses) ────────────────────
// Each role gets a different personality.
// This is "Prompt Engineering" — same AI, different instructions.

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

// ── Conversation Management ────────────────────────────────

export const createConversation = async (
  userId: string,
  title: string = "New Conversation",
  chatRole: ChatRole = "assistant"
): Promise<IConversation> => {
  return Conversation.create({ user: userId, title, chatRole });
};

export const getUserConversations = async (userId: string) => {
  return Conversation.find({ user: userId })
    .sort({ lastActivity: -1 })
    .select("-__v");
};

export const getConversationById = async (
  conversationId: string,
  userId: string
) => {
  const conv = await Conversation.findOne({
    _id: conversationId,
    user: userId,
  });
  if (!conv) throw new Error("Conversation not found");
  return conv;
};

export const deleteConversation = async (
  conversationId: string,
  userId: string
): Promise<void> => {
  const conv = await Conversation.findOne({
    _id: conversationId,
    user: userId,
  });
  if (!conv) throw new Error("Conversation not found");

  // Delete all messages in this conversation
  await Message.deleteMany({ conversation: conversationId });
  await Conversation.deleteOne({ _id: conversationId });
};

export const getConversationMessages = async (
  conversationId: string,
  userId: string
) => {
  // Verify ownership
  await getConversationById(conversationId, userId);

  return Message.find({ conversation: conversationId })
    .sort({ timestamp: 1 })
    .select("role content timestamp");
};

// ── Build Context for Gemini ────────────────────────────────

/**
 * Build the full context that gets sent to Gemini
 * This is where SHORT-TERM + LONG-TERM memory combine
 */
const buildContext = async (
  conversationId: string,
  userId: string,
  newMessage: string,
  chatRole: ChatRole
) => {
  // 1. Get short-term context (recent messages from MongoDB)
  const recentMessages = await getShortTermContext(conversationId);

  // 2. Search long-term memory (relevant past conversations from Pinecone)
  const longTermMemories = await searchLongTermMemory(newMessage, userId);

  // 3. Build the system instruction
  let systemInstruction = SYSTEM_PROMPTS[chatRole];

  // If we found relevant long-term memories, inject them into the system prompt
  if (longTermMemories.length > 0) {
    const memoryContext = longTermMemories.map((m) => m.text).join("\n---\n");

    systemInstruction += `\n\nYou have the following context from previous 
conversations with this user. Use this information naturally if relevant, 
but don't explicitly say "I remember from our previous conversation" — just 
use the knowledge as if you naturally know it:\n\n${memoryContext}`;
  }

  // 4. Format recent messages for Gemini's expected format
  // Gemini expects: { role: "user" | "model", parts: [{ text: "..." }] }
  const formattedHistory = recentMessages.map((msg: any) => ({
    role: msg.role as "user" | "model",
    parts: [{ text: msg.content }],
  }));

  return { systemInstruction, formattedHistory };
};

// ── Send Message (Non-Streaming) ────────────────────────────

export const sendMessage = async (
  conversationId: string,
  userId: string,
  userMessage: string
): Promise<{ userMsg: IMessage; aiMsg: IMessage }> => {
  // Verify conversation ownership
  const conversation = await getConversationById(conversationId, userId);

  // Save user message to MongoDB
  const userMsg = await Message.create({
    conversation: conversationId,
    role: "user",
    content: userMessage,
  });

  // Build context (short-term + long-term memory)
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

  // Call Gemini
  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: formattedHistory,
    config: {
      systemInstruction,
      temperature: 0.7,
    },
  });

  const aiContent = response.text || "I apologize, I could not generate a response.";

  // Save AI response to MongoDB
  const aiMsg = await Message.create({
    conversation: conversationId,
    role: "model",
    content: aiContent,
  });

  // Update conversation metadata
  await Conversation.findByIdAndUpdate(conversationId, {
    messageCount: (conversation.messageCount || 0) + 2,
    lastActivity: new Date(),
  });

  // Check if we need to archive to long-term memory
  const totalMessages = (conversation.messageCount || 0) + 2;
  if (totalMessages > 20) {
    // Archive in background — don't wait for it
    archiveToLongTermMemory(conversationId, userId).catch((err) =>
      console.error("[Memory] Background archive failed:", err.message)
    );
  }

  return { userMsg, aiMsg };
};

// ── Send Message (Streaming via SSE) ────────────────────────

/**
 * Send a message with streaming response using Server-Sent Events (SSE)
 *
 * THIS IS THE NEW CONCEPT — STREAMING:
 *
 * Normal flow:
 *   Client sends message → Server waits for FULL AI response → Sends response
 *   (User stares at loading spinner for 5-10 seconds)
 *
 * Streaming flow:
 *   Client sends message → Server gets AI response WORD BY WORD → Sends each word immediately
 *   (User sees text appearing in real-time, like ChatGPT)
 *
 * HOW SSE WORKS:
 *   1. Server sets special headers: Content-Type: text/event-stream
 *   2. Connection stays OPEN (doesn't close after first response)
 *   3. Server calls res.write() for each word/chunk
 *   4. When done, server calls res.end() to close connection
 *   5. Each message follows the SSE format: "data: {json}\n\n"
 *
 * WHY "data:" PREFIX?
 *   It's the SSE protocol. The browser's EventSource API expects this format.
 *   "data:" means "here's a chunk of data for you"
 *   "\n\n" (double newline) means "end of this chunk"
 */
export const sendMessageStream = async (
  conversationId: string,
  userId: string,
  userMessage: string,
  res: Response
): Promise<void> => {
  // Verify conversation ownership
  const conversation = await getConversationById(conversationId, userId);

  // Save user message to MongoDB
  await Message.create({
    conversation: conversationId,
    role: "user",
    content: userMessage,
  });

  // Build context (short-term + long-term memory)
  const { systemInstruction, formattedHistory } = await buildContext(
    conversationId,
    userId,
    userMessage,
    conversation.chatRole as ChatRole
  );

  // Add user message to history
  formattedHistory.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  // ── SET UP SSE HEADERS ──
  // These headers tell the browser: "Keep this connection open,
  // I'll keep sending you data"
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders(); // Send headers immediately

  let fullResponse = "";

  try {
    // ── STREAMING CALL TO GEMINI ──
    // generateContentStream returns an async iterable
    // Each iteration gives us a small chunk of the response
    const stream = await ai.models.generateContentStream({
      model: CHAT_MODEL,
      contents: formattedHistory,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    // ── SEND CHUNKS AS THEY ARRIVE ──
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;

        // Send this chunk to the client via SSE
        // Format: "data: {json}\n\n" — this is the SSE protocol
        res.write(`data: ${JSON.stringify({ type: "chunk", content: text })}\n\n`);
      }
    }

    // ── ALL CHUNKS SENT — SAVE FULL RESPONSE ──
    const aiMsg = await Message.create({
      conversation: conversationId,
      role: "model",
      content: fullResponse,
    });

    // Send completion event
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

    // Archive if needed (background)
    const totalMessages = (conversation.messageCount || 0) + 2;
    if (totalMessages > 20) {
      archiveToLongTermMemory(conversationId, userId).catch((err) =>
        console.error("[Memory] Background archive failed:", err.message)
      );
    }
  } catch (error: any) {
    // Send error via SSE
    res.write(
      `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
    );
  } finally {
    // Close the SSE connection
    res.end();
  }
};
