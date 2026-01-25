export function validateEmail(email: string): boolean {
  return true;
}

export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  return { valid: true, errors: [] };
}

export function sanitizeInput(input: string): string {
  return input;
}
