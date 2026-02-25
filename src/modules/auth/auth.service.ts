// ============================================================
// Auth Service — Business Logic for Authentication
// ============================================================
// This is the SERVICE LAYER — it contains the actual logic
// for registering and logging in users, separate from the
// HTTP handling (which lives in the controller).
//
// WHY SEPARATE SERVICE FROM CONTROLLER?
//   Controller: Handles HTTP (req, res) → extracts data → calls service
//   Service:    Pure business logic → doesn't know about HTTP
//
//   This separation means:
//   - Service logic can be reused (e.g., in tests, CLI tools, websockets)
//   - Controller stays thin — only handles request/response
//   - Easier to test: service functions are just input → output
//
// AUTH FLOW:
//   Register: User data → validate → hash password → save → generate JWT → return
//   Login:    Credentials → find user → compare password → generate JWT → return
//
// WHAT IS JWT?
//   JSON Web Token — a secure, encoded string containing user data.
//   Structure: header.payload.signature (3 parts separated by dots)
//   Example:   eyJhbG.eyJpZCI.SflKxw
//
//   - header:    Algorithm used (HS256)
//   - payload:   Data we store (user ID, expiration time)
//   - signature: Verification hash (ensures token wasn't tampered with)
//
//   The token is NOT encrypted — anyone can decode the payload.
//   But they CAN'T modify it without the JWT_SECRET, which only the server knows.
// ============================================================

import jwt from "jsonwebtoken";
import User from "./user.model.js";

/**
 * Generate a JWT token for an authenticated user.
 *
 * jwt.sign() creates a token containing the user's ID.
 * This token expires after JWT_EXPIRES_IN (e.g., "7d" = 7 days).
 * After expiration, the user must log in again to get a new token.
 */
const generateToken = (userId: string): string => {
  return jwt.sign(
    { id: userId }, // Payload — data encoded in the token
    process.env.JWT_SECRET as jwt.Secret, // Secret key — NEVER expose this
    {
      expiresIn: process.env.JWT_EXPIRES_IN as string, // e.g., "7d", "24h", "30m"
    } as jwt.SignOptions
  );
};

// ── Register ────────────────────────────────────────────────

/**
 * Register a new user.
 *
 * Flow:
 *   1. Check if email already exists (prevent duplicates)
 *   2. Create user (password is auto-hashed by the pre-save hook in user.model.ts)
 *   3. Generate JWT token
 *   4. Return user data + token (client stores the token for future requests)
 *
 * Throws: "Email already registered" if email exists (caught by controller → 409)
 */
export const register = async (data: {
  name: string;
  email: string;
  password: string;
}) => {
  // Check for duplicate email BEFORE creating (gives better error message)
  const existingUser = await User.findOne({ email: data.email });
  if (existingUser) throw new Error("Email already registered");

  // User.create() triggers the pre-save hook which hashes the password
  // We never manually hash here — the model handles it automatically
  const user = await User.create(data);
  const token = generateToken(user._id.toString());

  // Return user data WITHOUT password (never send password back to client)
  return {
    user: { id: user._id, name: user.name, email: user.email },
    token,
  };
};

// ── Login ───────────────────────────────────────────────────

/**
 * Authenticate a user with email and password.
 *
 * Flow:
 *   1. Find user by email (must .select("+password") since password is hidden by default)
 *   2. Compare entered password with stored hash using bcrypt
 *   3. Generate JWT token
 *   4. Return user data + token
 *
 * SECURITY NOTE: We use the same error message "Invalid email or password"
 * for both wrong email AND wrong password. This prevents attackers from
 * knowing whether an email exists in our database (user enumeration attack).
 */
export const login = async (data: { email: string; password: string }) => {
  // .select("+password") overrides the `select: false` in the schema
  // Without this, user.password would be undefined
  const user = await User.findOne({ email: data.email }).select("+password");
  if (!user) throw new Error("Invalid email or password");

  // comparePassword() uses bcrypt to check if the plain text matches the hash
  const isValid = await user.comparePassword(data.password);
  if (!isValid) throw new Error("Invalid email or password");

  const token = generateToken(user._id.toString());

  return {
    user: { id: user._id, name: user.name, email: user.email },
    token,
  };
};
