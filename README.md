# AI Chatbot with Memory (Production Level)

A production-grade AI chatbot API with **dual memory system** (short-term + long-term via RAG), **real-time streaming** (SSE), **role-based responses**, and **rate limiting** — built with TypeScript, Google Gemini, Pinecone, and MongoDB.

## Key Features

- **Dual Memory System**: Short-term (last 20 messages in MongoDB) + Long-term (older messages archived as embeddings in Pinecone)
- **Streaming Responses**: Real-time word-by-word responses via Server-Sent Events (SSE)
- **Role-Based Personas**: Assistant, Coder, Teacher, Creative — same AI, different system prompts
- **Rate Limiting**: 20 messages/minute per user, 10 auth attempts per 15 minutes
- **JWT Authentication**: Multi-user support with private conversations
- **TypeScript**: Full type safety across the entire codebase
- **Docker Ready**: Docker + Docker Compose for deployment

## Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript | Type-safe development |
| Express.js | HTTP server with SSE support |
| MongoDB (Mongoose) | Conversations, messages, users |
| Pinecone | Vector DB for long-term memory (RAG) |
| Google Gemini 2.5 Flash | Chat generation + streaming |
| Gemini Embedding 001 | Text-to-vector conversion (768 dims) |
| JWT | Stateless authentication |
| Docker | Containerized deployment |

## How Memory Works (RAG)

```
SHORT-TERM: Last 20 messages → stored in MongoDB → sent directly to Gemini
LONG-TERM:  Older messages → embeddings in Pinecone → searched via RAG

When user sends message:
  1. Load last 20 messages from MongoDB (short-term)
  2. Convert new message → embedding → search Pinecone (long-term)
  3. Combine short-term + relevant long-term + system prompt
  4. Send to Gemini → get response (streaming or full)
  5. Save both messages → archive old ones if > 20 messages
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/conversations` | Create conversation (with role) |
| GET | `/api/chat/conversations` | List all conversations |
| GET | `/api/chat/conversations/:id` | Get conversation details |
| DELETE | `/api/chat/conversations/:id` | Delete conversation |
| GET | `/api/chat/conversations/:id/messages` | Get all messages |
| POST | `/api/chat/conversations/:id/messages` | Send message |

### Send Message Body
```json
{
  "message": "Hello, how are you?",
  "stream": false
}
```
Set `stream: true` for SSE streaming response.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with your API keys (see `.env` template)

3. Set up Pinecone:
   - Create account at https://www.pinecone.io
   - Create index: name=`chatbot-memory`, dimensions=`768`, metric=`cosine`

4. Get Gemini API key:
   - Go to https://aistudio.google.com/apikey
   - Create and copy your API key

5. Run:
```bash
npm run dev
```

Or with Docker:
```bash
docker-compose up
```

## Architecture Guide

Open `education.architecture.html` in your browser for an interactive visual guide explaining the entire system architecture, memory flow, streaming mechanism, and role system.

## Project Structure

```
src/
├── config/          # DB, Gemini, Pinecone connections
├── middlewares/      # JWT auth, rate limiter
├── modules/
│   ├── auth/        # User registration & login
│   └── chat/        # Conversations, messages, memory, streaming
├── utils/           # Embedding generation
├── types/           # TypeScript interfaces
└── app.ts           # Express server entry point
```
