// ============================================================
// Rate Limiter Middleware
// ============================================================
// WHY RATE LIMITING?
//
// Every message the user sends costs YOU money (Gemini API call).
// Without rate limiting, someone could write a script that sends
// 10,000 messages per second and drain your API budget.
//
// Rate limiting says: "Each user can only send X messages per Y minutes."
//
// This is a PRODUCTION pattern — every real API has rate limiting.
// Twitter, GitHub, Stripe — they all do this.
//
// We use express-rate-limit which tracks requests per IP/user.
// ============================================================

import rateLimit from "express-rate-limit";

// Limiter for chat messages — most important one
export const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 20, // max 20 messages per minute per user
  message: {
    success: false,
    message: "Too many messages. Please wait a moment before sending more.",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

// Limiter for auth routes — prevent brute force attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 attempts per 15 minutes
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});
