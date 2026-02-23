// ============================================================
// Pinecone Vector Database Configuration
// ============================================================
// Same as Project 1 — but this time we store CONVERSATION
// messages instead of resume chunks.
//
// Project 1: Resume chunks → embeddings → Pinecone
// Project 2: Chat messages → embeddings → Pinecone (long-term memory)
//
// The pattern is identical. Only the DATA changes.
//
// WHAT IS PINECONE?
//   A specialized database for storing "vectors" (arrays of numbers).
//   Unlike MongoDB which searches by exact field matches,
//   Pinecone finds data by SIMILARITY — "find me things that mean
//   something similar to this text."
//
// WHY VECTOR DB FOR MEMORY?
//   Normal DB:  "Find messages where content = 'hello'" (exact match)
//   Vector DB:  "Find messages SIMILAR to 'greeting'" (semantic match)
//
//   This means when a user asks about "JavaScript frameworks",
//   the bot can recall past conversations about "React" or "Vue"
//   even though those exact words weren't in the search query.
//
// SETUP REQUIRED:
//   1. Create account at https://www.pinecone.io
//   2. Create an index with: dimensions=768, metric=cosine
//   3. Add PINECONE_API_KEY and PINECONE_INDEX_NAME to .env
// ============================================================

import { Pinecone } from "@pinecone-database/pinecone";

// Create the Pinecone client — similar to mongoose.connect() but for vectors
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY as string,
});

/**
 * Get a reference to our Pinecone index.
 *
 * An "index" in Pinecone is like a "collection" in MongoDB —
 * it's where all the vectors (embeddings) are stored.
 *
 * We use a function instead of a direct export so the index name
 * is read from .env at call time, not at import time.
 */
export const getPineconeIndex = () => {
  return pinecone.index(process.env.PINECONE_INDEX_NAME as string);
};

export default pinecone;
