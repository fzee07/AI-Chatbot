// ============================================================
// Memory Service — Long-Term Memory via RAG
// ============================================================
// This is the KEY DIFFERENCE between a basic chatbot and a
// production chatbot. Basic chatbots forget everything when
// the conversation gets too long. This one remembers.
//
// HOW IT WORKS:
//
// SHORT-TERM MEMORY (last ~20 messages):
//   Stored in MongoDB → sent directly to Gemini with each request
//   This is like your "working memory" — what you're currently thinking about
//
// LONG-TERM MEMORY (older messages):
//   Stored as embeddings in Pinecone Vector DB
//   When user asks something, we search for relevant past context
//   This is like your "long-term memory" — facts you remember from the past
//
// THE TRIGGER:
//   When a conversation reaches > 20 messages, older messages
//   get archived to Vector DB (long-term memory).
//   Recent 20 messages stay as short-term context.
//
// RETRIEVAL:
//   When user sends a new message, we:
//   1. Search Vector DB for relevant old messages (long-term)
//   2. Get the last 20 messages from MongoDB (short-term)
//   3. Combine both and send to Gemini
//
// This is EXACTLY the RAG pattern from Project 1:
//   Project 1: Resume chunks → Vector DB → Search → Send to AI
//   Project 2: Old messages → Vector DB → Search → Send to AI
// ============================================================

import { v4 as uuidv4 } from "uuid";
import { getPineconeIndex } from "../../config/pinecone";
import { generateEmbedding, generateEmbeddings } from "../../utils/embeddings";
import Message from "./message.model";
import Conversation from "./conversation.model";
import { IMessage, MemorySearchResult } from "../../types";

// How many recent messages to keep as direct context
const SHORT_TERM_LIMIT = 20;

// How many relevant memories to retrieve from Vector DB
const MEMORY_SEARCH_LIMIT = 5;

/**
 * Archive old messages to Vector DB (long-term memory)
 *
 * Called when a conversation exceeds SHORT_TERM_LIMIT messages.
 * Takes the older messages, converts them to embeddings, and stores in Pinecone.
 */
export const archiveToLongTermMemory = async (
  conversationId: string,
  userId: string
): Promise<void> => {
  try {
    // Get all messages except the most recent SHORT_TERM_LIMIT
    const allMessages = await Message.find({ conversation: conversationId })
      .sort({ timestamp: 1 }) // oldest first
      .lean();

    if (allMessages.length <= SHORT_TERM_LIMIT) return; // nothing to archive

    // Messages to archive = all except the last SHORT_TERM_LIMIT
    const messagesToArchive = allMessages.slice(
      0,
      allMessages.length - SHORT_TERM_LIMIT
    );

    // Check if these messages were already archived
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    // Combine messages into meaningful chunks (group every 4 messages)
    // This gives better context than individual messages
    const chunks: string[] = [];
    for (let i = 0; i < messagesToArchive.length; i += 4) {
      const group = messagesToArchive.slice(i, i + 4);
      const chunkText = group
        .map(
          (msg: any) => `${msg.role === "user" ? "User" : "AI"}: ${msg.content}`
        )
        .join("\n");
      chunks.push(chunkText);
    }

    if (chunks.length === 0) return;

    // Generate embeddings for all chunks
    console.log(
      `[Memory] Archiving ${chunks.length} chunks from conversation ${conversationId}`
    );
    const embeddings = await generateEmbeddings(chunks);

    // Store in Pinecone
    const pineconeIndex = getPineconeIndex();
    const vectors = embeddings.map((embedding, i) => ({
      id: `memory_${conversationId}_${uuidv4().slice(0, 8)}`,
      values: embedding,
      metadata: {
        text: chunks[i],
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
        type: "conversation_memory",
      },
    }));

    // Use user-specific namespace to keep memories separate
    await pineconeIndex.namespace(`user_${userId}`).upsert(vectors as any);

    // Mark conversation as having stored memory
    await Conversation.findByIdAndUpdate(conversationId, {
      memoryStored: true,
    });

    console.log(
      `[Memory] Archived ${chunks.length} chunks to long-term memory`
    );
  } catch (error: any) {
    console.error(`[Memory] Archive failed: ${error.message}`);
    // Don't throw — memory archiving failure shouldn't break chat
  }
};

/**
 * Search long-term memory for relevant past context
 *
 * This is the "Retrieval" step in RAG:
 * 1. Convert the new message → embedding
 * 2. Search Vector DB → find similar past conversations
 * 3. Return the relevant text
 */
export const searchLongTermMemory = async (
  query: string,
  userId: string
): Promise<MemorySearchResult[]> => {
  try {
    // Convert the user's new message to an embedding
    const queryEmbedding = await generateEmbedding(query);

    // Search Pinecone for similar past conversations
    const pineconeIndex = getPineconeIndex();
    const searchResults = await pineconeIndex
      .namespace(`user_${userId}`)
      .query({
        vector: queryEmbedding,
        topK: MEMORY_SEARCH_LIMIT,
        includeMetadata: true,
      });

    // Filter results with a minimum similarity score
    // Score < 0.7 means not really relevant
    const relevantMemories: MemorySearchResult[] = searchResults.matches
      .filter((match) => (match.score || 0) >= 0.7)
      .map((match) => ({
        text: match.metadata?.text as string,
        score: match.score || 0,
        conversationId: match.metadata?.conversationId as string,
        timestamp: match.metadata?.timestamp as string,
      }));

    if (relevantMemories.length > 0) {
      console.log(
        `[Memory] Found ${relevantMemories.length} relevant memories (scores: ${relevantMemories.map((m) => m.score.toFixed(3)).join(", ")})`
      );
    }

    return relevantMemories;
  } catch (error: any) {
    console.error(`[Memory] Search failed: ${error.message}`);
    return []; // Return empty — don't break chat if memory search fails
  }
};

/**
 * Get short-term context (recent messages from MongoDB)
 */
export const getShortTermContext = async (
  conversationId: string
): Promise<IMessage[]> => {
  return Message.find({ conversation: conversationId })
    .sort({ timestamp: -1 }) // newest first
    .limit(SHORT_TERM_LIMIT)
    .lean()
    .then((messages) => messages.reverse()); // reverse to chronological order
};
