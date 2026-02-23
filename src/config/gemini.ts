// ============================================================
// Google Gemini Configuration
// ============================================================
// In Project 1, we used OpenAI. Here we switch to Google's Gemini.
// The concepts are IDENTICAL — only the SDK syntax changes.
//
// Comparison:
//   OpenAI                         →  Gemini
//   ──────                            ──────
//   new OpenAI({ apiKey })         →  new GoogleGenAI({ apiKey })
//   openai.chat.completions.create →  ai.models.generateContent
//   openai.embeddings.create       →  ai.models.embedContent
//   model: "gpt-4o-mini"          →  model: "gemini-2.5-flash"
//   model: "text-embedding-ada-002"→  model: "gemini-embedding-001"
//   role: "assistant"              →  role: "model" (Gemini's term)
//
// The architecture, RAG flow, and everything else stays the same.
// This is WHY learning concepts > memorizing APIs.
// ============================================================

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

// Models we'll use
export const CHAT_MODEL = "gemini-2.5-flash";
export const EMBEDDING_MODEL = "gemini-embedding-001";

// Embedding dimensions — Gemini's default is 3072, but we use 768
// for efficiency. Pinecone index must match this number.
export const EMBEDDING_DIMENSIONS = 768;

export default ai;
