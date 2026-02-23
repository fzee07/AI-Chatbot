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
// ============================================================

import ai, { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../config/gemini";

/**
 * Generate embedding for a single text using Gemini
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    // Gemini returns embeddings array — we want the first one's values
    if (!response.embeddings || response.embeddings.length === 0) {
      throw new Error("No embedding returned from Gemini");
    }

    return response.embeddings[0].values as number[];
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
};

/**
 * Generate embeddings for multiple texts in batch
 */
export const generateEmbeddings = async (
  texts: string[]
): Promise<number[][]> => {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    if (!response.embeddings || response.embeddings.length === 0) {
      throw new Error("No embeddings returned from Gemini");
    }

    return response.embeddings.map((e) => e.values as number[]);
  } catch (error: any) {
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
};
