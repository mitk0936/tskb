export interface AuthMiddleware {
  authenticate(): void;
  authorize(roles: string[]): void;
}

export function authenticate() {}

export function authorize(roles: string[]) {}
