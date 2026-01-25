import { User, LoginCredentials, RegisterData, AuthTokens, AuthResponse } from "../../shared/types";

export class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    throw new Error("Not implemented");
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    throw new Error("Not implemented");
  }

  async logout(): Promise<void> {}

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    throw new Error("Not implemented");
  }

  async validateToken(token: string): Promise<User | null> {
    return null;
  }

  async getCurrentUser(): Promise<User | null> {
    return null;
  }
}
