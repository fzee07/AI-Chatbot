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
// ============================================================

import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY as string,
});

export const getPineconeIndex = () => {
  return pinecone.index(process.env.PINECONE_INDEX_NAME as string);
};

export default pinecone;
