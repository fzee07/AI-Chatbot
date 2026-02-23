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
//
// HOW IT WORKS:
//   1. Each request is tracked by the sender's IP address
//   2. A counter increments for each request within the time window
//   3. If the counter exceeds `max`, request is rejected with HTTP 429
//   4. After `windowMs` expires, the counter resets to zero
//
// HTTP 429 = "Too Many Requests" (the standard status code for rate limiting)
//
// RESPONSE HEADERS (when standardHeaders: true):
//   RateLimit-Limit: 20           → max requests allowed
//   RateLimit-Remaining: 15       → requests left in this window
//   RateLimit-Reset: 1625098000   → when the window resets (Unix timestamp)
// ============================================================

import rateLimit from "express-rate-limit";

// ── Chat Rate Limiter ───────────────────────────────────────
// Protects the AI API budget — the most important limiter.
// 20 messages per minute is generous for normal human use,
// but blocks automated scripts from draining your budget.
export const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window (in milliseconds: 1 min × 60 sec × 1000 ms)
  max: 20, // max 20 messages per minute per IP
  message: {
    success: false,
    message: "Too many messages. Please wait a moment before sending more.",
  },
  standardHeaders: true, // Return rate limit info in response headers (RateLimit-*)
  legacyHeaders: false, // Disable deprecated X-RateLimit-* headers
});

// ── Auth Rate Limiter ───────────────────────────────────────
// Prevents brute force attacks on login.
// If someone tries to guess passwords, they only get 10 attempts
// per 15 minutes before being temporarily locked out.
// Longer window (15 min vs 1 min) because auth abuse is more dangerous.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes (longer window for auth security)
  max: 10, // max 10 login/register attempts per 15 minutes
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});
