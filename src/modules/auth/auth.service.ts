import jwt from "jsonwebtoken";
import User from "./user.model";

const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET as jwt.Secret, {
    expiresIn: process.env.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
};

export const register = async (data: {
  name: string;
  email: string;
  password: string;
}) => {
  const existingUser = await User.findOne({ email: data.email });
  if (existingUser) throw new Error("Email already registered");

  const user = await User.create(data);
  const token = generateToken(user._id.toString());

  return {
    user: { id: user._id, name: user.name, email: user.email },
    token,
  };
};

export const login = async (data: { email: string; password: string }) => {
  const user = await User.findOne({ email: data.email }).select("+password");
  if (!user) throw new Error("Invalid email or password");

  const isValid = await user.comparePassword(data.password);
  if (!isValid) throw new Error("Invalid email or password");

  const token = generateToken(user._id.toString());

  return {
    user: { id: user._id, name: user.name, email: user.email },
    token,
  };
};
