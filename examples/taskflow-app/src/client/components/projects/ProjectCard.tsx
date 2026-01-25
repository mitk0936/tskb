import { Project } from "../../../shared/types";

export interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  return <div>Project Card</div>;
}
