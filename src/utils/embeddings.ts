// ============================================================
// Embeddings Utility (Gemini Version)
// ============================================================
// Same concept as Project 1, different API.
//
// Project 1 (OpenAI):
//   openai.embeddings.create({ model: "text-embedding-ada-002", input: text })
//   → Returns 1536-dimensional vector
//
// Project 2 (Gemini):
//   ai.models.embedContent({ model: "gemini-embedding-001", contents: text })
//   → Returns 3072-dimensional vector (or 768 with outputDimensionality)
//
// The output is the same thing — an array of numbers that
// captures the MEANING of the text.
//
// WHAT IS AN EMBEDDING?
//   Text → Array of numbers (vector) that represents its MEANING.
//
//   Example (simplified to 3 dimensions):
//     "I love dogs"  → [0.9, 0.1, 0.8]
//     "I adore puppies" → [0.85, 0.12, 0.78]  (similar! close in vector space)
//     "Quantum physics" → [0.1, 0.9, 0.2]     (different! far in vector space)
//
//   In reality, we use 768 dimensions (not 3) for much richer meaning capture.
//
// WHY 768 DIMENSIONS?
//   Gemini's default is 3072, but we reduce to 768 for:
//   - Faster similarity searches in Pinecone
//   - Lower storage costs
//   - Minimal quality loss for our use case
//   The Pinecone index MUST be created with the same dimension count (768).
//
// WHERE EMBEDDINGS ARE USED IN THIS APP:
//   1. ARCHIVING: Old messages → embedding → store in Pinecone (memory.service.ts)
//   2. SEARCHING: New message → embedding → search Pinecone for similar past conversations
// ============================================================

import ai, { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../config/gemini";

/**
 * Generate an embedding for a SINGLE text string.
 *
 * Used when: searching long-term memory (convert the user's new message
 * to a vector, then find similar vectors in Pinecone).
 *
 * @param text - The text to convert to a vector
 * @returns number[] - A 768-dimensional vector (array of 768 numbers)
 *
 * Example:
 *   const vector = await generateEmbedding("What is React?");
 *   // vector = [0.123, -0.456, 0.789, ...] (768 numbers)
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL, // "gemini-embedding-001"
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS, // 768 (must match Pinecone index)
      },
    });

    // Gemini returns an array of embeddings (even for single input)
    // We want the first (and only) embedding's values
    if (!response.embeddings || response.embeddings.length === 0) {
      throw new Error("No embedding returned from Gemini");
    }

    return response.embeddings[0].values as number[];
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
};

/**
 * Generate embeddings for MULTIPLE texts in a single API call (batch).
 *
 * Used when: archiving old messages to long-term memory
 * (convert multiple message chunks to vectors at once).
 *
 * Batching is more efficient than calling generateEmbedding() in a loop:
 *   - 1 API call instead of N calls
 *   - Lower latency
 *   - Same cost (billed per token, not per request)
 *
 * @param texts - Array of text strings to convert
 * @returns number[][] - Array of 768-dimensional vectors
 *
 * Example:
 *   const vectors = await generateEmbeddings(["What is React?", "How does CSS work?"]);
 *   // vectors = [[0.123, ...], [0.456, ...]] (2 arrays of 768 numbers each)
 */
export const generateEmbeddings = async (
  texts: string[]
): Promise<number[][]> => {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts, // Pass array instead of single string
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    if (!response.embeddings || response.embeddings.length === 0) {
      throw new Error("No embeddings returned from Gemini");
    }

    // Map each embedding object to just its values array
    return response.embeddings.map((e) => e.values as number[]);
  } catch (error: any) {
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
};
