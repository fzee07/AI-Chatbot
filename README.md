# AI Chatbot with Memory (Production Level)

A production-grade AI chatbot API with **dual memory system** (short-term + long-term via RAG), **real-time streaming** (SSE), **role-based AI personas**, and **multi-user authentication** — built with TypeScript, Google Gemini, Pinecone, and MongoDB.

---

## What This Project Does

This is a **backend API** for an AI chatbot that **remembers past conversations** — even across sessions. Unlike basic chatbots that forget everything after a few messages, this one uses a **dual memory system** inspired by how human memory works:

- **Short-term memory** (last 20 messages) → stored in MongoDB, sent directly to the AI
- **Long-term memory** (older messages) → archived as vector embeddings in Pinecone, retrieved via semantic search (RAG)

The chatbot also supports **real-time streaming** (words appear one by one, like ChatGPT) and **role-based personas** (same AI, different personalities).

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Dual Memory (RAG)** | Short-term context (MongoDB) + long-term recall (Pinecone vector search) |
| **Streaming Responses** | Real-time word-by-word output via Server-Sent Events (SSE) |
| **Role-Based Personas** | 4 AI personalities: Assistant, Coder, Teacher, Creative |
| **JWT Authentication** | Multi-user support with private, isolated conversations |
| **Rate Limiting** | 20 messages/min for chat, 10 attempts/15min for auth |
| **TypeScript** | Full type safety across the entire codebase |
| **Docker Ready** | One-command deployment with Docker Compose |

---

## Tech Stack

| Technology | Role in This Project |
|---|---|
| **TypeScript** | Type-safe development — catches bugs at compile time |
| **Express.js 5** | HTTP server with SSE streaming support |
| **MongoDB** (Mongoose) | Stores users, conversations, and recent messages |
| **Pinecone** | Vector database for long-term memory (semantic search) |
| **Google Gemini 2.5 Flash** | AI model for chat generation + streaming |
| **Gemini Embedding 001** | Converts text → 768-dimensional vectors |
| **JWT** (jsonwebtoken) | Stateless authentication tokens |
| **bcryptjs** | Password hashing (never stores plain text) |
| **express-rate-limit** | Prevents API budget abuse |
| **Docker + Compose** | Containerized production deployment |

---

## How It Works

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│            (Postman, Frontend App, curl)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP Requests
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXPRESS SERVER (:3000)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────────┐ │
│  │   CORS   │→ │  JSON    │→ │     ROUTE HANDLERS         │ │
│  │          │  │  Parser  │  │                            │ │
│  └──────────┘  └──────────┘  │  /api/auth → Auth Module   │ │
│                              │  /api/chat → Chat Module   │ │
│                              └────────────────────────────┘ │
└──────────┬───────────────────────────────┬──────────────────┘
           │                               │
           ▼                               ▼
┌──────────────────┐           ┌──────────────────────────┐
│    MongoDB       │           │    Google Gemini API      │
│                  │           │                          │
│  • Users         │           │  • Chat Generation       │
│  • Conversations │           │  • Streaming Responses   │
│  • Messages      │           │  • Text Embeddings       │
│  (Short-term)    │           └──────────────────────────┘
└──────────────────┘
           │
           │  Old messages archived as embeddings
           ▼
┌──────────────────┐
│  Pinecone        │
│  Vector DB       │
│                  │
│  • Embeddings    │
│  • Semantic      │
│    Search        │
│  (Long-term)     │
└──────────────────┘
```

### Dual Memory System (RAG)

RAG stands for **Retrieval-Augmented Generation** — it means we *retrieve* relevant past context and *augment* the AI's prompt with it before *generating* a response.

```
SHORT-TERM MEMORY (Working Memory):
├── Last 20 messages stored in MongoDB
├── Loaded with every chat request
├── Sent directly to Gemini as conversation history
└── Like your "working memory" — what you're currently thinking about

LONG-TERM MEMORY (Archived Memory):
├── Messages older than 20 get archived to Pinecone
├── Converted to vector embeddings (768-dimensional arrays of numbers)
├── Grouped into chunks of 4 messages for better context
├── Stored with metadata (conversationId, userId, timestamp)
├── Searched via semantic similarity when new message arrives
└── Like your "long-term memory" — facts you recall when relevant

RETRIEVAL FLOW (What happens when you send a message):
  1. User sends: "How do I use React hooks?"
  2. Load last 20 messages from MongoDB (short-term context)
  3. Convert "How do I use React hooks?" → embedding (vector of numbers)
  4. Search Pinecone for similar past conversations (long-term recall)
  5. Find match: past conversation where user discussed React components
  6. Combine: system prompt + long-term memories + short-term history
  7. Send everything to Gemini → get response
  8. Save both messages to MongoDB
  9. If total messages > 20 → archive old ones to Pinecone (background)
```

### Streaming vs Non-Streaming

```
WITHOUT STREAMING (stream: false):
  Client → Server waits 3-10 seconds → Sends complete JSON response
  User experience: Loading spinner... then full text appears at once

WITH STREAMING (stream: true — SSE):
  Client → Server sends words AS THEY'RE GENERATED → Real-time display
  User experience: Text appears word-by-word, like ChatGPT

SSE Protocol:
  Headers: Content-Type: text/event-stream
  Each chunk: "data: {"type":"chunk","content":"Hello"}\n\n"
  Completion: "data: {"type":"done","messageId":"...","fullContent":"..."}\n\n"
  Error:      "data: {"type":"error","message":"..."}\n\n"
```

### Role-Based AI Personas

Same Gemini model, different system prompts — like giving the same actor different scripts:

| Role | Personality | Use Case |
|------|-------------|----------|
| `assistant` | Helpful, friendly, clear | General Q&A, everyday tasks |
| `coder` | Expert developer, code examples | Programming help, debugging |
| `teacher` | Patient, uses analogies, step-by-step | Learning new concepts |
| `creative` | Vivid imagination, engaging | Storytelling, brainstorming |

---

## API Endpoints

### Authentication (Rate limited: 10 requests / 15 minutes)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|:---:|
| POST | `/api/auth/register` | Create new user account | No |
| POST | `/api/auth/login` | Login and receive JWT token | No |

### Chat (All routes require JWT token)

| Method | Endpoint | Description | Rate Limited |
|--------|----------|-------------|:---:|
| POST | `/api/chat/conversations` | Create a new conversation | No |
| GET | `/api/chat/conversations` | List all user's conversations | No |
| GET | `/api/chat/conversations/:id` | Get conversation details | No |
| DELETE | `/api/chat/conversations/:id` | Delete conversation + messages | No |
| GET | `/api/chat/conversations/:id/messages` | Get all messages in conversation | No |
| POST | `/api/chat/conversations/:id/messages` | **Send message to AI** | Yes (20/min) |

### Example API Usage

**1. Register:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com", "password": "123456"}'
```

**2. Login (save the token):**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "123456"}'
```

**3. Create a conversation:**
```bash
curl -X POST http://localhost:3000/api/chat/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"title": "React Help", "chatRole": "coder"}'
```

**4. Send a message (non-streaming):**
```bash
curl -X POST http://localhost:3000/api/chat/conversations/CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"message": "How do I use React hooks?", "stream": false}'
```

**5. Send a message (streaming):**
```bash
curl -N -X POST http://localhost:3000/api/chat/conversations/CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"message": "Explain closures in JavaScript", "stream": true}'
```

---

## Setup & Installation

### Prerequisites
- **Node.js** 18+ (recommended: 20)
- **MongoDB** running locally or a MongoDB Atlas account
- **Pinecone** account (free tier works)
- **Google AI Studio** account (for Gemini API key)

### 1. Install dependencies
```bash
npm install
```

### 2. Create `.env` file
```env
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ai-chatbot-memory

# JWT Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# Pinecone Vector DB
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=chatbot-memory
```

### 3. Set up Pinecone
1. Create an account at [pinecone.io](https://www.pinecone.io)
2. Create a new index with these settings:
   - **Name:** `chatbot-memory`
   - **Dimensions:** `768`
   - **Metric:** `cosine`
3. Copy your API key to `.env`

### 4. Get Gemini API key
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create and copy your API key to `.env`

### 5. Run the application
```bash
# Development (with hot-reload)
npm run dev

# Production
npm run build && npm start
```

### Docker Deployment
```bash
# Start both app and MongoDB
docker-compose up

# Or build and run in background
docker-compose up -d --build
```

---

## Project Structure

```
ai-chatbot-memory/
├── src/
│   ├── app.ts                          # Express server entry point
│   ├── config/
│   │   ├── db.ts                       # MongoDB connection
│   │   ├── gemini.ts                   # Google Gemini AI client + model configs
│   │   └── pinecone.ts                 # Pinecone Vector DB client
│   ├── middlewares/
│   │   ├── auth.ts                     # JWT authentication guard
│   │   └── rateLimiter.ts              # Request rate limiting (chat + auth)
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── user.model.ts           # User schema (bcrypt password hashing)
│   │   │   ├── auth.service.ts         # Register/login business logic
│   │   │   ├── auth.controller.ts      # HTTP request handlers for auth
│   │   │   └── auth.routes.ts          # Auth route definitions
│   │   └── chat/
│   │       ├── conversation.model.ts   # Conversation schema (title, role, metadata)
│   │       ├── message.model.ts        # Message schema (role, content, timestamp)
│   │       ├── memory.service.ts       # Long-term memory: archive + search (RAG)
│   │       ├── chat.service.ts         # Core engine: context building, AI calls, streaming
│   │       ├── chat.controller.ts      # HTTP handlers for chat operations
│   │       └── chat.routes.ts          # Chat route definitions
│   ├── types/
│   │   └── index.ts                    # TypeScript interfaces for all data shapes
│   └── utils/
│       └── embeddings.ts               # Text → vector embedding generation
├── .env                                # Environment variables (API keys, secrets)
├── .gitignore                          # Ignored files (node_modules, dist, .env)
├── Dockerfile                          # Container build instructions
├── docker-compose.yml                  # Multi-container orchestration (app + MongoDB)
├── education.architecture.html         # Interactive visual architecture guide
├── package.json                        # Dependencies and scripts
└── tsconfig.json                       # TypeScript compiler configuration
```

### Architecture Pattern

```
Route → Controller → Service → Model → Database
  │         │            │         │
  │         │            │         └── Mongoose schemas (data shape + validation)
  │         │            └── Business logic (AI calls, memory, streaming)
  │         └── HTTP handling (req/res, validation, status codes)
  └── URL mapping (which URL triggers which handler)
```

---

## Security Layers

| Layer | What It Does | Where |
|-------|-------------|-------|
| **Rate Limiting** | Prevents API budget abuse + brute force attacks | `rateLimiter.ts` |
| **JWT Authentication** | Verifies identity on every protected request | `auth.ts` middleware |
| **Ownership Checks** | Users can only access their OWN conversations | `chat.service.ts` |
| **Password Hashing** | bcrypt with 12 salt rounds — never stores plaintext | `user.model.ts` |
| **Pinecone Namespacing** | Each user's memories in separate namespace | `memory.service.ts` |
| **Input Validation** | Checks for empty messages, missing fields | Controllers |

---

## Architecture Guide

Open `education.architecture.html` in your browser for an **interactive visual guide** explaining the entire system architecture, memory flow, streaming mechanism, and role system.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot-reload (nodemon + ts-node) |
| `npm run build` | Compile TypeScript → JavaScript (outputs to `dist/`) |
| `npm start` | Run the compiled production build |
| `docker-compose up` | Start app + MongoDB in Docker containers |
