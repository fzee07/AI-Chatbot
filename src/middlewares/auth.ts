// ============================================================
// JWT Authentication Middleware
// ============================================================
// This middleware protects routes that require a logged-in user.
// It sits BETWEEN the request and the route handler, acting as
// a security guard: "Show me your token or you can't enter."
//
// WHAT IS JWT (JSON Web Token)?
//   A secure, encoded string that proves a user is logged in.
//   When a user logs in, we give them a token. On every future
//   request, they send this token back. We verify it's valid
//   and attach the user's data to the request.
//
// HOW IT WORKS (step by step):
//   1. Client sends request with header: "Authorization: Bearer <token>"
//   2. Middleware extracts the token from the header
//   3. jwt.verify() checks: Is the token valid? Has it expired?
//   4. If valid → decode the user's ID from the token
//   5. Look up the user in MongoDB by that ID
//   6. Attach the user object to req.user (so route handlers can use it)
//   7. Call next() → request continues to the route handler
//
// WHY "Bearer"?
//   It's a convention from the OAuth 2.0 spec.
//   "Bearer" means "I'm bearing (carrying) this token."
//   The full header looks like: "Authorization: Bearer eyJhbGciOi..."
//
// MIDDLEWARE PATTERN:
//   Request → [Auth Middleware] → [Rate Limiter] → Route Handler → Response
//   If any middleware calls res.status(401), the chain stops.
//   If it calls next(), the chain continues to the next handler.
// ============================================================

import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../modules/auth/user.model.js";
import { AuthRequest } from "../types/index.js";

/**
 * Protect middleware — verifies JWT token and attaches user to request.
 *
 * Usage in routes:
 *   router.use(protect);                     // Protect ALL routes in this router
 *   router.get("/me", protect, getProfile);  // Protect a single route
 */
export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Step 1: Extract token from "Authorization: Bearer <token>" header
    // The ?. (optional chaining) safely handles missing authorization header
    if (req.headers.authorization?.startsWith("Bearer")) {
      // "Bearer eyJhbGciOi...".split(" ") → ["Bearer", "eyJhbGciOi..."]
      // We want index [1] — the actual token
      token = req.headers.authorization.split(" ")[1];
    }

    // Step 2: No token = no access
    if (!token) {
      res.status(401).json({ success: false, message: "Not authorized. No token provided." });
      return;
    }

    // Step 3: Verify the token — jwt.verify() throws if invalid or expired
    // It decodes the token and returns the payload we encoded during login (the user's ID)
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };

    // Step 4: Look up the user in the database by the decoded ID
    // This ensures the user still exists (they could have been deleted after login)
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401).json({ success: false, message: "User no longer exists" });
      return;
    }

    // Step 5: Attach user to request object — now ANY route handler downstream
    // can access req.user to know WHO is making the request
    req.user = user;

    // Step 6: Continue to the next middleware or route handler
    next();
  } catch (error) {
    // jwt.verify() throws if token is expired, tampered with, or malformed
    res.status(401).json({ success: false, message: "Not authorized. Invalid token." });
  }
};
