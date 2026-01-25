import { CommentService } from "../services/comment.service";

export class CommentController {
  constructor(private commentService: CommentService) {}

  async getTaskComments(taskId: string) {}

  async createComment(data: any) {}

  async updateComment(id: string, content: string) {}

  async deleteComment(id: string) {}
}
