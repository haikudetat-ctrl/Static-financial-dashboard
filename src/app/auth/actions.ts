"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  validateLoginInput,
  validateRegistrationInput,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  message?: string;
  errors?: Record<string, string>;
};

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validation = validateLoginInput({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (validation.errors) {
    return { errors: validation.errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(validation.data);

  if (error) {
    return { message: "Email or password is incorrect." };
  }

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/today");
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const validation = validateRegistrationInput({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (validation.errors) {
    return { errors: validation.errors };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: validation.data.email,
    password: validation.data.password,
    options: {
      data: { name: validation.data.name },
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    return { message: error.message };
  }

  return {
    message:
      "Account created. Check your email, then ask a manager to assign your workspace.",
  };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
