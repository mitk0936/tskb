import { TaskComment } from "../../shared/types";

export class CommentService {
  async getByTask(taskId: string): Promise<TaskComment[]> {
    return [];
  }

  async create(
    commentData: Omit<TaskComment, "id" | "createdAt" | "updatedAt">
  ): Promise<TaskComment> {
    throw new Error("Not implemented");
  }

  async update(id: string, content: string): Promise<TaskComment | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }
}
