"use server";

import { redirect } from "next/navigation";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import {
  SignupSchema,
  LoginSchema,
  AuthFormState,
} from "@/lib/definitions";

const log = logger.child({ module: "auth" });


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
    log.warn({ email }, "Signup blocked — email already exists");
    return { message: "An account with this email already exists." };
  }

  // 3. Hash password and create user
  const passwordHash = await argon2.hash(password);
  const user = await db.user.create({
    data: { name, email, passwordHash },
  });

  // 4. Create session and redirect
  log.info({ userId: user.id, email }, "New user signed up");
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
    log.warn({ email }, "Login failed — unknown email");
    return { message: "Invalid email or password." };
  }

  // 3. Verify password
  const isValid = await argon2.verify(user.passwordHash, password);
  if (!isValid) {
    log.warn({ email, userId: user.id }, "Login failed — wrong password");
    return { message: "Invalid email or password." };
  }

  // 4. Create session and redirect
  log.info({ userId: user.id, email }, "User logged in");
  await createSession(user.id, user.role);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// LOGOUT
// ---------------------------------------------------------------------------
export async function logout(): Promise<void> {
  log.info("User logged out");
  await deleteSession();
  redirect("/login");
}
