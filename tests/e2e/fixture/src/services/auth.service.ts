import type { User, CreateUserInput } from "../models/user.js";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult {
  user: User;
  tokens: AuthTokens;
}

export class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    throw new Error("Not implemented");
  }

  async register(input: CreateUserInput, password: string): Promise<LoginResult> {
    throw new Error("Not implemented");
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    throw new Error("Not implemented");
  }

  async logout(userId: string): Promise<void> {
    throw new Error("Not implemented");
  }

  private async hashPassword(password: string): Promise<string> {
    throw new Error("Not implemented");
  }

  private generateTokens(user: User): AuthTokens {
    throw new Error("Not implemented");
  }
}
