// ============================================================
// Conversation Model (MongoDB Schema)
// ============================================================
// A "Conversation" is a chat session between a user and the AI.
// Think of it like a chat thread in WhatsApp or Discord.
//
// Each conversation has:
//   - An owner (user) — for multi-user isolation
//   - A title — like "Help with React project"
//   - A chatRole — the AI's personality for this conversation
//   - Metadata — message count, last activity, memory status
//
// RELATIONSHIP TO MESSAGES:
//   One Conversation → Many Messages (1:N relationship)
//   Conversation is the PARENT, Messages are the CHILDREN.
//   When we delete a conversation, we also delete all its messages.
//
// WHY chatRole PER CONVERSATION?
//   Instead of globally switching the AI's personality,
//   each conversation can have its own role. So a user might have:
//   - "Math Homework" conversation with chatRole: "teacher"
//   - "Build a Website" conversation with chatRole: "coder"
//   - "Story Ideas" conversation with chatRole: "creative"
//
// WHY TRACK messageCount AND lastActivity?
//   - messageCount: Determines when to archive to long-term memory (>20)
//   - lastActivity: Used for sorting (most recent conversations first)
//   These could be computed from messages, but storing them here
//   avoids counting messages on every request (performance optimization).
// ============================================================

import mongoose, { Schema } from "mongoose";
import { IConversation, ChatRole } from "../../types/index.js";

const conversationSchema = new Schema(
  {
    // The user who owns this conversation
    // Schema.Types.ObjectId = a reference to another document (like a foreign key in SQL)
    // ref: "User" tells Mongoose which model this ID points to (for .populate())
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Human-readable name for the conversation
    title: {
      type: String,
      default: "New Conversation",
      trim: true,
    },
    // The "personality" of the chatbot for this conversation
    // Each role maps to a different system prompt in chat.service.ts
    chatRole: {
      type: String,
      enum: ["assistant", "coder", "teacher", "creative"] as ChatRole[],
      default: "assistant",
    },
    // Running count of messages (user + AI) in this conversation
    // Used to determine when to archive to long-term memory (threshold: 20)
    messageCount: {
      type: Number,
      default: 0,
    },
    // When was the last message sent? Used for sorting conversations
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    // Flag: has this conversation's old messages been archived to Pinecone?
    // Prevents duplicate archiving of the same messages
    memoryStored: {
      type: Boolean,
      default: false,
    },
  },
  // timestamps: true → auto-adds createdAt and updatedAt fields
  { timestamps: true }
);

// "Conversation" → MongoDB creates a "conversations" collection (auto-pluralized)
export default mongoose.model<IConversation>("Conversation", conversationSchema);
