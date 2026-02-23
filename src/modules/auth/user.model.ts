// ============================================================
// User Model (MongoDB Schema via Mongoose)
// ============================================================
// This defines HOW a user is stored in the database.
//
// WHAT IS A MONGOOSE SCHEMA?
//   A schema is like a blueprint that says:
//   "A User must have a name (string), email (string), and password (string)"
//   If someone tries to save a user without an email, MongoDB will reject it.
//
// WHAT IS A MODEL?
//   A model is the schema turned into a usable JavaScript class.
//   Schema = blueprint, Model = factory that creates/queries documents.
//   User.create({...})  → creates a new user
//   User.findOne({...}) → finds a user
//   User.findById(id)   → finds by MongoDB _id
//
// SECURITY FEATURES IN THIS FILE:
//   1. select: false on password → password is NEVER returned in queries by default
//      (you must explicitly ask for it with .select("+password"))
//   2. Pre-save hook → automatically hashes password before saving
//   3. comparePassword method → safely compares passwords without exposing the hash
//
// PASSWORD HASHING (bcrypt):
//   We NEVER store plain text passwords. Instead:
//   "mypassword123" → bcrypt.hash() → "$2a$12$LJ3m4ys..." (irreversible hash)
//   Even if someone steals the database, they can't read the passwords.
//   The number 12 is the "salt rounds" — higher = more secure but slower.
// ============================================================

import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { IUser } from "../../types";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"], // [validation, error message]
      trim: true, // Remove whitespace from both ends: "  John  " → "John"
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true, // No two users can have the same email (creates a DB index)
      lowercase: true, // "John@Gmail.COM" → "john@gmail.com" (prevents duplicates)
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6, // Minimum 6 characters
      // select: false → THIS IS CRUCIAL FOR SECURITY
      // By default, password will NOT be included in query results.
      // To get it, you must explicitly: User.findOne({}).select("+password")
      select: false,
    },
  },
  // timestamps: true → Mongoose automatically adds createdAt and updatedAt fields
  { timestamps: true }
);

// ── Pre-Save Hook: Auto-Hash Password ──────────────────────
// This runs BEFORE every .save() call on a User document.
// It intercepts the plain text password and replaces it with a hash.
//
// isModified("password") check prevents re-hashing an already hashed password
// when updating other fields like name or email.
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  // 12 = salt rounds (2^12 = 4096 iterations of hashing)
  this.password = await bcrypt.hash(this.password, 12);
});

// ── Instance Method: Compare Password ──────────────────────
// Used during login to check if the entered password matches the stored hash.
// bcrypt.compare() handles the hashing internally — we never decrypt the hash.
//
// Usage: const isMatch = await user.comparePassword("entered_password");
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Create and export the model — "User" becomes the "users" collection in MongoDB
// (Mongoose automatically pluralizes and lowercases the model name)
export default mongoose.model<IUser>("User", userSchema);
