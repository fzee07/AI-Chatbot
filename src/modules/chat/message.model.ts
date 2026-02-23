import mongoose, { Schema } from "mongoose";
import { IMessage, MessageRole } from "../../types";

const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true, // Index for fast queries by conversation
    },
    // "user" = human message, "model" = Gemini's response
    // Gemini uses "model" instead of OpenAI's "assistant"
    role: {
      type: String,
      enum: ["user", "model"] as MessageRole[],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IMessage>("Message", messageSchema);
