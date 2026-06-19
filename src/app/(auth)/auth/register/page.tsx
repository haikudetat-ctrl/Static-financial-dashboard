import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Register",
};

export default function RegisterPage() {
  return (
    <>
      <div className="mb-8">
        <p className="mb-3 font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          New account
        </p>
        <h2 className="text-4xl font-semibold tracking-[-0.045em]">
          Join your team.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Create your login. A manager will assign your organization and
          location.
        </p>
      </div>
      <AuthForm mode="register" />
    </>
  );
}
