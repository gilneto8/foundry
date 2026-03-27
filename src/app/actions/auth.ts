"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import {
  SignupSchema,
  LoginSchema,
  AuthFormState,
} from "@/lib/definitions";

// ---------------------------------------------------------------------------
// SIGN UP
// ---------------------------------------------------------------------------
export async function signup(
  state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  // 1. Validate
  const validated = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, password } = validated.data;

  // 2. Check for duplicate email
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { message: "An account with this email already exists." };
  }

  // 3. Hash password and create user
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { name, email, passwordHash },
  });

  // 4. Create session and redirect
  await createSession(user.id, user.role);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
export async function login(
  state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  // 1. Validate
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;

  // 2. Find user
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return { message: "Invalid email or password." };
  }

  // 3. Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return { message: "Invalid email or password." };
  }

  // 4. Create session and redirect
  await createSession(user.id, user.role);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// LOGOUT
// ---------------------------------------------------------------------------
export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
