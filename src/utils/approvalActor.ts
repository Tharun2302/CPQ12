export interface StepActorSource {
  email?: string;
  actedBy?: { name?: string; email: string };
}

export function formatStepActor(step?: StepActorSource | null): string | null {
  const actedBy = step?.actedBy;
  if (actedBy?.email) {
    const name = actedBy.name?.trim();
    return name ? `By: ${name} (${actedBy.email})` : `By: ${actedBy.email}`;
  }
  return step?.email ? `Email: ${step.email}` : null;
}
