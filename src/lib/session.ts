import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SessionPayload {
  userId: string;
  role: "USER" | "ADMIN";
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Key — lazily resolved so the module can be imported at build time
// without SESSION_SECRET being present (Docker builds exclude .env).
// ---------------------------------------------------------------------------
let _encodedKey: Uint8Array | null = null;

function getKey(): Uint8Array {
  if (_encodedKey) return _encodedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set.");
  }
  _encodedKey = new TextEncoder().encode(secret);
  return _encodedKey;
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------
export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getKey());
}

export async function decrypt(
  token: string | undefined = ""
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie Management
// ---------------------------------------------------------------------------
const COOKIE_NAME = "foundry.session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(
  userId: string,
  role: SessionPayload["role"] = "USER"
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ userId, role, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return decrypt(token);
}

export async function updateSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = await decrypt(token);

  if (!token || !payload) return;

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Data Access Layer (DAL)
// ---------------------------------------------------------------------------
/**
 * Verifies the session from the cookie and returns the payload.
 * Redirects to /login if the session is missing or invalid.
 * Use this in Server Components and Server Actions that require auth.
 */
export async function verifySession(): Promise<SessionPayload> {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  return session;
}

/**
 * Same as verifySession() but also requires the ADMIN role.
 */
export async function verifyAdminSession(): Promise<SessionPayload> {
  const session = await verifySession();

  if (session.role !== "ADMIN") {
    redirect("/");
  }

  return session;
}
