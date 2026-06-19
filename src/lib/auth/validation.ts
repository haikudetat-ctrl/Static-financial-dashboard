type LoginInput = {
  email: string;
  password: string;
};

type RegistrationInput = LoginInput & {
  name: string;
  confirmPassword: string;
};

type ValidationResult<T> =
  | { data: T; errors?: never }
  | { data?: never; errors: Record<string, string> };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginInput(
  input: LoginInput,
): ValidationResult<LoginInput> {
  const email = input.email.trim().toLowerCase();
  const errors: Record<string, string> = {};

  if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (input.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    data: {
      email,
      password: input.password,
    },
  };
}

export function validateRegistrationInput(
  input: RegistrationInput,
): ValidationResult<RegistrationInput> {
  const loginResult = validateLoginInput(input);
  const errors = loginResult.errors ? { ...loginResult.errors } : {};
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) {
    errors.name = "Enter your name.";
  }

  if (input.password !== input.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    data: {
      name,
      email,
      password: input.password,
      confirmPassword: input.confirmPassword,
    },
  };
}
