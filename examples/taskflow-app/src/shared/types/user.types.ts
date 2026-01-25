export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  userId: string;
  teamId: string;
  role: "owner" | "admin" | "member";
  joinedAt: Date;
}
