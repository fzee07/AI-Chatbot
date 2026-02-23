import mongoose, { Schema } from "mongoose";
import { IConversation, ChatRole } from "../../types";

const conversationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      default: "New Conversation",
      trim: true,
    },
    // The "personality" of the chatbot for this conversation
    chatRole: {
      type: String,
      enum: ["assistant", "coder", "teacher", "creative"] as ChatRole[],
      default: "assistant",
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    // Flag: has this conversation been saved to long-term memory?
    memoryStored: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IConversation>("Conversation", conversationSchema);
