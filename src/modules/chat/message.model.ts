// ============================================================
// Message Model (MongoDB Schema)
// ============================================================
// A "Message" is a single chat bubble — either from the user
// or from the AI (Gemini). Messages belong to a Conversation.
//
// SCHEMA DESIGN:
//   - conversation: Which conversation this message belongs to (parent reference)
//   - role: "user" (human typed it) or "model" (AI generated it)
//   - content: The actual text of the message
//   - timestamp: When the message was sent
//
// WHY "model" INSTEAD OF "assistant"?
//   Google Gemini uses "model" to refer to the AI's messages.
//   OpenAI uses "assistant". They mean the same thing — just
//   different terminology between providers.
//   This matters because Gemini's API expects { role: "model" }
//   in the conversation history format.
//
// WHAT IS index: true?
//   An index on the `conversation` field makes MongoDB queries
//   MUCH faster when searching by conversation ID.
//
//   Without index: MongoDB scans EVERY message to find matches → O(n)
//   With index:    MongoDB uses a lookup table → O(log n)
//
//   Since we query messages by conversation ID on EVERY chat request,
//   this index is critical for performance.
//
// WHAT IS .lean()?
//   When querying messages, we often use .lean() which returns
//   plain JavaScript objects instead of full Mongoose documents.
//   This is faster and uses less memory (no Mongoose methods attached).
// ============================================================

import mongoose, { Schema } from "mongoose";
import { IMessage, MessageRole } from "../../types";

const messageSchema = new Schema(
  {
    // Reference to the parent conversation — creates a 1:N relationship
    // index: true creates a database index for fast lookups by conversation
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true, // IMPORTANT: Makes queries by conversation ID much faster
    },
    // "user" = human message, "model" = Gemini's response
    // Gemini uses "model" instead of OpenAI's "assistant" terminology
    role: {
      type: String,
      enum: ["user", "model"] as MessageRole[],
      required: true,
    },
    // The actual text content of the message
    content: {
      type: String,
      required: true,
    },
    // When this message was sent (used for ordering and archiving)
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// "Message" → MongoDB creates a "messages" collection
export default mongoose.model<IMessage>("Message", messageSchema);
