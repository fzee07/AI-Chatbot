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
//
// WHAT THIS FILE DOES:
//   1. Creates a single Gemini AI client (reused across the app)
//   2. Exports model names as constants (easy to change later)
//   3. Sets embedding dimensions (must match your Pinecone index)
//
// WHY A SEPARATE CONFIG FILE?
//   - Single source of truth for AI settings
//   - If you switch models, you only change THIS file
//   - Other files import from here: import ai from "../config/gemini"
// ============================================================

import { GoogleGenAI } from "@google/genai";

// Create the Gemini client — this is the main entry point for all AI calls
// Similar to: const openai = new OpenAI({ apiKey }) in OpenAI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

// ── Model Constants ─────────────────────────────────────────
// Stored as constants so they're easy to update in one place

// CHAT_MODEL: For generating conversational responses (the "brain")
export const CHAT_MODEL = "gemini-2.5-flash";

// EMBEDDING_MODEL: For converting text → numbers (vectors) for similarity search
export const EMBEDDING_MODEL = "gemini-embedding-001";

// Embedding dimensions — Gemini's default is 3072, but we use 768
// for efficiency. Pinecone index must match this number.
// Lower dimensions = faster search + less storage, with minimal quality loss
export const EMBEDDING_DIMENSIONS = 768;

export default ai;
