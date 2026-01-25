import { useState, useEffect } from "react";
import { Project } from "../../shared/types";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  return { projects, isLoading, error };
}
