import type { CoachNextStep } from "@jobseeker/contracts";

interface NextStepsCardProps {
  steps: CoachNextStep[];
  onToggle: (stepId: string, completed: boolean) => void;
}

export function NextStepsCard({ steps, onToggle }: NextStepsCardProps) {
  if (steps.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Next steps
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={step.completed}
              onChange={(event) => onToggle(step.id, event.target.checked)}
              className="mt-1 size-4 rounded border-border"
            />
            <span
              className={`text-sm ${
                step.completed ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {step.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
