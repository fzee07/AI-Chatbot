// ============================================================
// Type Definitions for AI Chatbot with Memory
// ============================================================
// In TypeScript, we define the SHAPE of our data upfront.
// This catches bugs BEFORE runtime — something JavaScript can't do.
//
// For example, if you try to access message.conten (typo),
// TypeScript will yell at you immediately. JavaScript would
// just return undefined and you'd spend 30 minutes debugging.
// ============================================================

import { Document } from "mongoose";
import { Request } from "express";

// ── User Types ──────────────────────────────────────────────

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Express Request with authenticated user attached
export interface AuthRequest extends Request {
  user?: IUser;
}

// ── Chat Types ──────────────────────────────────────────────

// The roles Gemini understands in a conversation
// "user" = the human, "model" = the AI (Gemini calls it "model", not "assistant")
export type MessageRole = "user" | "model";

// Chatbot personality presets — each gets a different system prompt
export type ChatRole =
  | "assistant"   // General helpful assistant
  | "coder"       // Programming expert
  | "teacher"     // Patient explainer
  | "creative";   // Creative writer

export interface IMessage extends Document {
  conversation: string; // ObjectId reference
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface IConversation extends Document {
  user: string; // ObjectId reference
  title: string;
  chatRole: ChatRole;
  messageCount: number;
  lastActivity: Date;
  // Whether long-term memory has been created for this conversation
  memoryStored: boolean;
}

// ── Memory Types ────────────────────────────────────────────

// What gets stored in Vector DB for long-term memory
export interface MemoryChunk {
  text: string;
  conversationId: string;
  userId: string;
  timestamp: string;
  role: MessageRole;
}

// Search result from Vector DB
export interface MemorySearchResult {
  text: string;
  score: number;
  conversationId: string;
  timestamp: string;
}

// ── API Response Types ──────────────────────────────────────

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

// ── Chat Request Body ───────────────────────────────────────

export interface SendMessageBody {
  message: string;
  stream?: boolean; // Whether to use SSE streaming
}

export interface CreateConversationBody {
  title?: string;
  chatRole?: ChatRole;
}
