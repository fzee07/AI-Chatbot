// ============================================================
// Type Definitions for AI Chatbot with Memory
// ============================================================
// In TypeScript, we define the SHAPE of our data upfront.
// This catches bugs BEFORE runtime — something JavaScript can't do.
//
// For example, if you try to access message.conten (typo),
// TypeScript will yell at you immediately. JavaScript would
// just return undefined and you'd spend 30 minutes debugging.
//
// WHAT IS AN INTERFACE?
//   An interface defines a "contract" — it says what properties
//   an object MUST have and what TYPE each property must be.
//   It doesn't create any runtime code — it only exists during compilation.
//
// WHAT IS "extends Document"?
//   Mongoose Document adds MongoDB-specific properties to our interfaces:
//   _id, save(), remove(), etc. So IUser has BOTH our custom fields
//   (name, email, password) AND Mongoose's built-in fields (_id, etc.)
//
// WHY SEPARATE TYPES FILE?
//   - Single source of truth for data shapes
//   - Every file imports from here instead of defining their own types
//   - Changes to data structure only need updating in ONE place
//   - Prevents circular dependencies between modules
// ============================================================

import { Document } from "mongoose";
import { Request } from "express";

// ── User Types ──────────────────────────────────────────────

/**
 * IUser — The shape of a User document in MongoDB.
 *
 * extends Document means this interface includes Mongoose's built-in
 * properties (_id, save(), etc.) PLUS our custom fields.
 */
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  // Custom instance method defined in user.model.ts
  // Used to verify passwords during login
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * AuthRequest — Express Request with an authenticated user attached.
 *
 * After the protect middleware verifies the JWT token,
 * it attaches the user to req.user. This interface tells TypeScript
 * that req.user exists (and is optional because not all routes use auth).
 *
 * Usage: (req: AuthRequest) => { const userId = req.user!._id; }
 */
export interface AuthRequest extends Request {
  user?: IUser; // Optional because it's only set after auth middleware runs
}

// ── Chat Types ──────────────────────────────────────────────

/**
 * MessageRole — Who sent this message?
 * "user" = the human typed it
 * "model" = the AI (Gemini) generated it
 *
 * NOTE: Gemini uses "model" while OpenAI uses "assistant".
 * Same concept, different naming convention.
 */
export type MessageRole = "user" | "model";

/**
 * ChatRole — The AI's personality preset for a conversation.
 * Each role maps to a different system prompt in chat.service.ts.
 * The same AI model behaves differently based on these instructions.
 */
export type ChatRole =
  | "assistant"   // General helpful assistant
  | "coder"       // Programming expert — gives code examples
  | "teacher"     // Patient educator — uses analogies and step-by-step
  | "creative";   // Creative writer — vivid and imaginative

/**
 * IMessage — The shape of a Message document in MongoDB.
 * Represents a single chat bubble (either user or AI).
 */
export interface IMessage extends Document {
  conversation: string; // ObjectId reference to the parent Conversation
  role: MessageRole; // "user" or "model"
  content: string; // The actual text of the message
  timestamp: Date; // When the message was sent
}

/**
 * IConversation — The shape of a Conversation document in MongoDB.
 * A conversation is a chat thread that contains many messages.
 */
export interface IConversation extends Document {
  user: string; // ObjectId reference to the User who owns this
  title: string; // Human-readable name (e.g., "Help with React")
  chatRole: ChatRole; // AI personality for this conversation
  messageCount: number; // Total messages (used to trigger memory archiving)
  lastActivity: Date; // For sorting conversations by recency
  memoryStored: boolean; // Whether old messages have been archived to Pinecone
}

// ── Memory Types ────────────────────────────────────────────

/**
 * MemoryChunk — What gets stored in Pinecone Vector DB.
 * When messages are archived to long-term memory, they're grouped
 * into chunks of ~4 messages and stored with this metadata.
 */
export interface MemoryChunk {
  text: string; // The combined text of 4 messages
  conversationId: string; // Which conversation this came from
  userId: string; // Who this belongs to (for namespace isolation)
  timestamp: string; // When this was archived
  role: MessageRole; // Primary role of the chunk
}

/**
 * MemorySearchResult — What comes back when searching Pinecone.
 * Contains the matched text and a similarity score (0 to 1).
 */
export interface MemorySearchResult {
  text: string; // The retrieved conversation chunk
  score: number; // Similarity score: 0 = unrelated, 1 = identical meaning
  conversationId: string; // Which conversation this came from
  timestamp: string; // When this was archived
}

// ── API Response Types ──────────────────────────────────────

/**
 * ApiResponse — Standard response format for all API endpoints.
 * Every response follows this shape for consistency:
 * { success: true/false, message: "...", data?: {...} }
 *
 * The <T> is a generic — it means data can be any type.
 * ApiResponse<IUser> → data is IUser
 * ApiResponse<IConversation[]> → data is an array of conversations
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T; // Optional — error responses don't include data
}

// ── Request Body Types ──────────────────────────────────────
// These define what the CLIENT sends in POST request bodies.
// Used in controllers: const { message, stream } = req.body as SendMessageBody;

/**
 * SendMessageBody — Request body for sending a message to the AI.
 */
export interface SendMessageBody {
  message: string; // The user's message text
  stream?: boolean; // true = SSE streaming, false = JSON response (default)
}

/**
 * CreateConversationBody — Request body for creating a new conversation.
 */
export interface CreateConversationBody {
  title?: string; // Optional custom title (default: "New Conversation")
  chatRole?: ChatRole; // Optional AI personality (default: "assistant")
}
