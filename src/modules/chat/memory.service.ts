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
//
// WHY NOT JUST SEND ALL MESSAGES TO GEMINI?
//   AI models have a "context window" limit (max tokens per request).
//   Gemini 2.5 Flash has ~1M tokens, but:
//   1. More tokens = higher cost (you pay per token)
//   2. More tokens = slower response time
//   3. AI gets confused with too much irrelevant context
//   The dual-memory approach sends only RELEVANT context, keeping
//   requests fast, cheap, and focused.
// ============================================================

import { v4 as uuidv4 } from "uuid";
import { getPineconeIndex } from "../../config/pinecone.js";
import { generateEmbedding, generateEmbeddings } from "../../utils/embeddings.js";
import Message from "./message.model.js";
import Conversation from "./conversation.model.js";
import { IMessage, MemorySearchResult } from "../../types/index.js";

// ── Constants ───────────────────────────────────────────────

// How many recent messages to keep as direct context (sent to Gemini each time)
const SHORT_TERM_LIMIT = 20;

// How many relevant memories to retrieve from Vector DB per query
// More memories = more context but slower and more expensive
const MEMORY_SEARCH_LIMIT = 5;

// ── Archive to Long-Term Memory ─────────────────────────────

/**
 * Archive old messages to Vector DB (long-term memory).
 *
 * Called AUTOMATICALLY when a conversation exceeds SHORT_TERM_LIMIT messages.
 * This runs in the BACKGROUND (fire-and-forget) so it doesn't slow down the chat.
 *
 * PROCESS:
 *   1. Fetch all messages from the conversation
 *   2. Keep the last 20 as short-term (untouched)
 *   3. Take the older messages and group them into chunks of 4
 *   4. Convert each chunk to a vector embedding
 *   5. Store embeddings in Pinecone (namespaced by user for privacy)
 *
 * WHY CHUNKS OF 4?
 *   Individual messages are too short — "What is React?" doesn't give enough context.
 *   Grouping 4 messages (2 user + 2 AI exchanges) creates meaningful context
 *   that the vector search can match against more effectively.
 *
 * WHY NAMESPACED BY USER?
 *   Pinecone namespaces act like separate containers within the same index.
 *   User A's memories are in namespace "user_123", User B's in "user_456".
 *   This ensures users can NEVER access each other's conversation history.
 */
export const archiveToLongTermMemory = async (
  conversationId: string,
  userId: string
): Promise<void> => {
  try {
    // Get ALL messages in this conversation, sorted oldest → newest
    // .lean() returns plain objects (faster than full Mongoose documents)
    const allMessages = await Message.find({ conversation: conversationId })
      .sort({ timestamp: 1 }) // oldest first
      .lean();

    // Nothing to archive if we haven't exceeded the limit
    if (allMessages.length <= SHORT_TERM_LIMIT) return;

    // Split: messages to archive (old) vs. messages to keep (recent)
    // Example: 30 messages total → archive first 10, keep last 20
    const messagesToArchive = allMessages.slice(
      0,
      allMessages.length - SHORT_TERM_LIMIT
    );

    // Verify the conversation still exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    // Group messages into chunks of 4 for better semantic meaning
    // Each chunk becomes one vector in Pinecone
    const chunks: string[] = [];
    for (let i = 0; i < messagesToArchive.length; i += 4) {
      const group = messagesToArchive.slice(i, i + 4);
      // Format: "User: hello\nAI: Hi there!\nUser: ...\nAI: ..."
      const chunkText = group
        .map(
          (msg: any) => `${msg.role === "user" ? "User" : "AI"}: ${msg.content}`
        )
        .join("\n");
      chunks.push(chunkText);
    }

    if (chunks.length === 0) return;

    // Convert all text chunks to vector embeddings in a single batch
    console.log(
      `[Memory] Archiving ${chunks.length} chunks from conversation ${conversationId}`
    );
    const embeddings = await generateEmbeddings(chunks);

    // Prepare Pinecone vectors with metadata
    const pineconeIndex = getPineconeIndex();
    const vectors = embeddings.map((embedding, i) => ({
      // Unique ID for each vector (prevents duplicates on re-archive)
      id: `memory_${conversationId}_${uuidv4().slice(0, 8)}`,
      values: embedding, // The 768-dimensional vector
      metadata: {
        text: chunks[i], // Original text (returned on search for context)
        conversationId, // Which conversation this came from
        userId, // Who this belongs to
        timestamp: new Date().toISOString(),
        type: "conversation_memory", // Distinguish from other vector types
      },
    }));

    // Upsert (insert or update) vectors into user's private namespace
    await pineconeIndex.namespace(`user_${userId}`).upsert(vectors as any);

    // Mark this conversation as having archived memories
    await Conversation.findByIdAndUpdate(conversationId, {
      memoryStored: true,
    });

    console.log(
      `[Memory] Archived ${chunks.length} chunks to long-term memory`
    );
  } catch (error: any) {
    // IMPORTANT: We catch and log errors instead of throwing
    // Memory archiving is a "nice-to-have" — if it fails, the chat should still work
    // The user's experience should never break because of a memory operation
    console.error(`[Memory] Archive failed: ${error.message}`);
  }
};

// ── Search Long-Term Memory ─────────────────────────────────

/**
 * Search long-term memory for relevant past context.
 *
 * This is the "Retrieval" step in RAG (Retrieval-Augmented Generation):
 *   1. Convert the new message → embedding (vector of numbers)
 *   2. Search Vector DB → find similar past conversations
 *   3. Return the relevant text to be injected into the AI's context
 *
 * SIMILARITY SCORE:
 *   Pinecone returns a score from 0 to 1 for each match:
 *   - 1.0 = identical meaning
 *   - 0.7+ = relevant (our threshold)
 *   - 0.5 = somewhat related
 *   - 0.0 = completely unrelated
 *
 *   We filter out anything below 0.7 to avoid injecting irrelevant context,
 *   which could confuse the AI or waste tokens.
 */
export const searchLongTermMemory = async (
  query: string,
  userId: string
): Promise<MemorySearchResult[]> => {
  try {
    // Step 1: Convert the user's new message to an embedding
    // "What is React?" → [0.123, -0.456, 0.789, ...] (768 numbers)
    const queryEmbedding = await generateEmbedding(query);

    // Step 2: Search Pinecone for similar past conversations
    // Only searches within this user's namespace (privacy!)
    const pineconeIndex = getPineconeIndex();
    const searchResults = await pineconeIndex
      .namespace(`user_${userId}`)
      .query({
        vector: queryEmbedding, // The query vector to compare against
        topK: MEMORY_SEARCH_LIMIT, // Return top 5 most similar
        includeMetadata: true, // Include the original text in results
      });

    // Step 3: Filter results with a minimum similarity score
    // Score < 0.7 means the memory isn't really relevant to the current question
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
    // Return empty array instead of throwing — don't break chat if memory search fails
    // The AI will still respond, just without long-term context
    console.error(`[Memory] Search failed: ${error.message}`);
    return [];
  }
};

// ── Get Short-Term Context ──────────────────────────────────

/**
 * Get short-term context (recent messages from MongoDB).
 *
 * Fetches the last 20 messages in chronological order.
 * These are sent directly to Gemini as conversation history.
 *
 * WHY SORT THEN REVERSE?
 *   MongoDB: sort({ timestamp: -1 }) + limit(20) → gets the 20 NEWEST messages
 *   But they come in reverse order (newest first).
 *   .reverse() puts them back in chronological order for the AI.
 *
 *   Alternative: sort({ timestamp: 1 }) would give oldest first,
 *   but then limit(20) would give the 20 OLDEST — not what we want.
 */
export const getShortTermContext = async (
  conversationId: string
): Promise<IMessage[]> => {
  return Message.find({ conversation: conversationId })
    .sort({ timestamp: -1 }) // newest first (to get the RIGHT 20)
    .limit(SHORT_TERM_LIMIT) // take only 20
    .lean() // plain objects (faster, less memory)
    .then((messages) => messages.reverse()); // flip to chronological order
};
