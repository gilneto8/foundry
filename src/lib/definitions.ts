import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth Schemas
// ---------------------------------------------------------------------------
export const SignupSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }).trim(),
  email: z.email({ message: "Please enter a valid email address." }).trim(),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { message: "Password must contain at least one letter." })
    .regex(/[0-9]/, { message: "Password must contain at least one number." })
    .trim(),
});

export const LoginSchema = z.object({
  email: z.email({ message: "Please enter a valid email address." }).trim(),
  password: z.string().min(1, { message: "Password is required." }).trim(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript Types
// ---------------------------------------------------------------------------
export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

// ---------------------------------------------------------------------------
// Server Action Form State
// ---------------------------------------------------------------------------
export type AuthFormState =
  | {
      errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
      };
      message?: string;
    }
  | undefined;
