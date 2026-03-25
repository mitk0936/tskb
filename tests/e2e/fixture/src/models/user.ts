export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: User["role"];
}
