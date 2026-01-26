import { Doc, H1, H2, H3, P, List, Li, Snippet, ref, Export, Term } from "tskb";
import { useState, createContext } from "react";

import {
  AuthResponse,
  LoginCredentials,
} from "examples/taskflow-app/src/shared/types/auth.types.js";
import { User } from "examples/taskflow-app/src/shared/types/user.types.js";
import { UserRepository } from "examples/taskflow-app/src/server/database/repositories/user.repository.js";

declare global {
  namespace tskb {
    interface Exports {
      AuthService: Export<{
        desc: "Handles user authentication, registration, and token management";
        type: typeof import("examples/taskflow-app/src/server/services/auth.service.js").AuthService;
      }>;
      AuthMiddleware: Export<{
        desc: "Authentication and authorization middleware for protected routes";
        type: typeof import("examples/taskflow-app/src/server/middleware/auth.middleware.js").authenticate;
      }>;
      AuthContext: Export<{
        desc: "React Context providing authentication state and login/logout methods";
        type: typeof import("examples/taskflow-app/src/client/contexts/AuthContext.js").AuthContext;
      }>;
      ApiClient: Export<{
        desc: "Base HTTP client for API communication with authentication";
        type: typeof import("examples/taskflow-app/src/client/services/api.service.js").ApiClient;
      }>;
    }

    interface Terms {
      jwt: Term<"JSON Web Token - stateless authentication mechanism using signed tokens">;
      middlewareChain: Term<"Sequential processing pattern where request passes through multiple handlers">;
      contextProvider: Term<"React pattern for managing and sharing state across component tree without prop drilling">;
    }
  }
}

const JwtTerm = ref as tskb.Terms["jwt"];
const MiddlewareChainTerm = ref as tskb.Terms["middlewareChain"];
const ContextProviderTerm = ref as tskb.Terms["contextProvider"];

const AuthServiceExport = ref as tskb.Exports["AuthService"];
const AuthMiddlewareExport = ref as tskb.Exports["AuthMiddleware"];
const AuthContextExport = ref as tskb.Exports["AuthContext"];
const ApiClientExport = ref as tskb.Exports["ApiClient"];

const ServicesFolder = ref as tskb.Folders["Services"];

export default (
  <Doc>
    <H1>Authentication System</H1>

    <P>
      The authentication system provides secure user login, registration, and session management
      using {JwtTerm} tokens. The implementation spans both client and server layers.
    </P>

    <H2>Server-Side Authentication</H2>

    <H3>AuthService</H3>

    <P>
      The {AuthServiceExport} in {ServicesFolder} handles the core authentication logic including
      password validation, token generation, and user verification.
    </P>

    <Snippet
      code={() => {
        const jwt = require("jsonwebtoken");
        const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

        class AuthService {
          constructor(private userRepository: UserRepository) {}

          async login(credentials: LoginCredentials): Promise<AuthResponse> {
            // 1. Validate credentials against database
            const user = await this.userRepository.findByEmail(credentials.email);
            if (!user) throw new Error("User not found");

            // 2. Verify password (assuming user has password field)
            const userPassword = (user as any).password || (user as any).passwordHash;
            const isValid = await this.verifyPassword(credentials.password, userPassword);
            if (!isValid) throw new Error("Invalid credentials");

            // 3. Generate JWT tokens
            const tokens = this.generateTokens(user.id);

            // 4. Return user and tokens
            return { user, tokens };
          }

          private async verifyPassword(password: string, hash: string): Promise<boolean> {
            // Use bcrypt to compare password with hash
            const bcrypt = require("bcrypt");
            return bcrypt.compare(password, hash);
          }

          private generateTokens(userId: string) {
            const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "15m" });
            const refreshToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
            return { accessToken, refreshToken };
          }

          async validateToken(token: string): Promise<User | null> {
            try {
              // Verify JWT signature and expiration
              const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
              return this.userRepository.findById(payload.userId);
            } catch (error) {
              return null;
            }
          }
        }
      }}
    />

    <H3>Authentication Middleware</H3>

    <P>
      The {AuthMiddlewareExport} protects API routes by validating {JwtTerm}
      tokens on each request. It runs as part of the {MiddlewareChainTerm}.
    </P>

    <Snippet
      code={() => {
        // Assume authService is available as a singleton or injected dependency
        class AuthService {
          constructor(private userRepository: UserRepository) {}
          async validateToken(token: string): Promise<User | null> {
            const jwt = require("jsonwebtoken");
            try {
              const payload = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
              return this.userRepository.findById(payload.userId);
            } catch {
              return null;
            }
          }
        }

        const authService = new AuthService({} as UserRepository);

        function authenticate() {
          return async (req: any, res: any, next: any) => {
            // 1. Extract token from Authorization header
            const token = req.headers.authorization?.split(" ")[1];

            if (!token) {
              return res.status(401).json({ error: "No token provided" });
            }

            // 2. Validate token
            const user = await authService.validateToken(token);

            // 3. Attach user to request
            if (user) {
              req.user = user;
              next();
            } else {
              res.status(401).json({ error: "Unauthorized" });
            }
          };
        }
      }}
    />

    <H2>Client-Side Authentication</H2>

    <H3>AuthContext</H3>

    <P>
      The {AuthContextExport} uses the {ContextProviderTerm} pattern to manage authentication state
      across the React application.
    </P>

    <Snippet
      code={() => {
        const AUTH_TOKEN_KEY = "auth_token";
        const AuthContext = createContext<any>(null);

        // Mock auth API service
        const authApiService = {
          login: async (creds: LoginCredentials) => ({
            user: { id: "1", email: creds.email } as User,
            tokens: { accessToken: "token", refreshToken: "refresh" },
          }),
          logout: async () => {},
        };

        function AuthProvider({ children }: { children: React.ReactNode }) {
          const [user, setUser] = useState<User | null>(null);
          const [isAuthenticated, setIsAuthenticated] = useState(false);

          const login = async (email: string, password: string) => {
            const response = await authApiService.login({ email, password });
            setUser(response.user);
            setIsAuthenticated(true);
            // Store tokens in localStorage
            localStorage.setItem(AUTH_TOKEN_KEY, response.tokens.accessToken);
          };

          const logout = async () => {
            await authApiService.logout();
            setUser(null);
            setIsAuthenticated(false);
            localStorage.removeItem(AUTH_TOKEN_KEY);
          };

          return (
            <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
              {children}
            </AuthContext.Provider>
          );
        }
      }}
    />

    <H3>Token Storage and Refresh</H3>

    <List>
      <Li>Access tokens are stored in localStorage using AUTH_TOKEN_KEY constant</Li>
      <Li>Refresh tokens enable obtaining new access tokens without re-authentication</Li>
      <Li>The {ApiClientExport} automatically includes tokens in request headers</Li>
      <Li>Token expiration is handled by refreshing or redirecting to login</Li>
    </List>

    <H2>Security Considerations</H2>

    <List>
      <Li>Passwords are never stored in plain text - only hashed versions</Li>
      <Li>JWT secrets should be strong and kept in environment variables</Li>
      <Li>Tokens have expiration times to limit exposure if compromised</Li>
      <Li>HTTPS should be enforced in production for secure token transmission</Li>
      <Li>CORS configuration limits which origins can access the API</Li>
    </List>
  </Doc>
);
