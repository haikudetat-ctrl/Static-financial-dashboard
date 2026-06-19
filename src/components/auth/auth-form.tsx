"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/app/auth/actions";

const initialState: AuthActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 inline-flex min-h-12 w-full items-center justify-center bg-[var(--foreground)] px-5 text-sm font-semibold text-white transition hover:bg-[#343a32] active:translate-y-px disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  error?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className="h-12 border bg-white px-3.5 text-base font-normal text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(32,36,31,0.03)] placeholder:text-[#797e76] focus:border-[var(--accent)] focus:outline-none"
      />
      {error && (
        <span id={`${name}-error`} className="text-xs text-[#a63f2f]">
          {error}
        </span>
      )}
    </label>
  );
}

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "register";
  next?: string;
}) {
  const isLogin = mode === "login";
  const [state, action] = useActionState(
    isLogin ? loginAction : registerAction,
    initialState,
  );

  return (
    <form action={action} className="grid gap-5">
      {!isLogin && (
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          error={state.errors?.name}
        />
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={state.errors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={isLogin ? "current-password" : "new-password"}
        error={state.errors?.password}
      />
      {!isLogin && (
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={state.errors?.confirmPassword}
        />
      )}
      {next && <input type="hidden" name="next" value={next} />}
      {state.message && (
        <p
          role="status"
          className="border-l-2 border-[var(--accent)] bg-[#f6eee7] px-3 py-2.5 text-sm leading-6 text-[#713d20]"
        >
          {state.message}
        </p>
      )}
      <SubmitButton label={isLogin ? "Sign in" : "Create account"} />
      <p className="text-center text-sm text-[var(--muted)]">
        {isLogin ? "Need an account?" : "Already have an account?"}{" "}
        <Link
          href={isLogin ? "/auth/register" : "/auth/login"}
          className="font-semibold text-[var(--foreground)] underline decoration-[var(--accent)] decoration-2 underline-offset-4"
        >
          {isLogin ? "Register" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
