import { TaskComment } from "../../../shared/types";

export interface CommentListProps {
  comments: TaskComment[];
}

export function CommentList({ comments }: CommentListProps) {
  return <div>Comments</div>;
}
