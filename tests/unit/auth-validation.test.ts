import { describe, expect, it } from "vitest";

import {
  validateLoginInput,
  validateRegistrationInput,
} from "@/lib/auth/validation";

describe("authentication validation", () => {
  it("normalizes a valid login email", () => {
    expect(
      validateLoginInput({
        email: " Manager@Example.com ",
        password: "long-enough-password",
      }),
    ).toEqual({
      data: {
        email: "manager@example.com",
        password: "long-enough-password",
      },
    });
  });

  it("rejects malformed login input", () => {
    expect(
      validateLoginInput({ email: "not-an-email", password: "short" }),
    ).toEqual({
      errors: {
        email: "Enter a valid email address.",
        password: "Password must be at least 8 characters.",
      },
    });
  });

  it("requires matching registration passwords and a name", () => {
    expect(
      validateRegistrationInput({
        name: "",
        email: "person@example.com",
        password: "password-one",
        confirmPassword: "password-two",
      }),
    ).toEqual({
      errors: {
        name: "Enter your name.",
        confirmPassword: "Passwords do not match.",
      },
    });
  });
});
