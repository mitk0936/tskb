export interface ProjectFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

export function ProjectForm({ initialData, onSubmit, onCancel }: ProjectFormProps) {
  return <div>Project Form</div>;
}
