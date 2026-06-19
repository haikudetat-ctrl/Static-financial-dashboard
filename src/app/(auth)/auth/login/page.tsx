import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <>
      <div className="mb-8">
        <p className="mb-3 font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Welcome back
        </p>
        <h2 className="text-4xl font-semibold tracking-[-0.045em]">
          Sign in to the shift.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Use the email and password assigned to your organization.
        </p>
      </div>
      {error === "callback" && (
        <p className="mb-5 border-l-2 border-[#a63f2f] bg-[#f8e9e6] px-3 py-2.5 text-sm text-[#7e3025]">
          That sign-in link could not be verified. Please try again.
        </p>
      )}
      <AuthForm mode="login" next={next} />
    </>
  );
}
