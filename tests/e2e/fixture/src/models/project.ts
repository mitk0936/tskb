export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  memberIds: string[];
  createdAt: Date;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  ownerId: string;
}
