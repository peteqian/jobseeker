import { Link } from "@tanstack/react-router";
import type { StructuredProfile } from "@jobseeker/contracts";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

interface ProfileSummaryCardProps {
  projectSlug: string;
  profile: StructuredProfile | null;
}

const WORK_RIGHT_LABELS: Record<string, string> = {
  citizen: "Citizen",
  permanent_resident: "Permanent resident",
  work_visa: "Work visa",
  student_visa: "Student visa",
  needs_sponsorship: "Needs sponsorship",
};

/**
 * Compact, read-only view of the candidate the run searches for. Editing lives
 * on the Profile route — this card only links there.
 */
export function ProfileSummaryCard({ projectSlug, profile }: ProfileSummaryCardProps) {
  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <p className="text-sm font-medium">No profile yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Build a profile so the explorer can score roles against you.
        </p>
        <Link
          to="/projects/$projectId/profile"
          params={{ projectId: projectSlug }}
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}
        >
          Build profile
        </Link>
      </div>
    );
  }

  const skills = profile.skills.slice(0, 6).map((skill) => skill.name);
  const auRight = profile.workRights?.rights.find((entry) => entry.country === "AU");
  const workRightLabel = auRight ? WORK_RIGHT_LABELS[auRight.status] : undefined;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile.identity.name ?? "Your profile"}</p>
          {profile.identity.headline ? (
            <p className="truncate text-xs text-muted-foreground">{profile.identity.headline}</p>
          ) : null}
        </div>
        <Link
          to="/projects/$projectId/profile"
          params={{ projectId: projectSlug }}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-mr-2 -mt-1 h-7 shrink-0",
          })}
        >
          Edit
        </Link>
      </div>

      {skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <Badge key={skill} variant="secondary" className="font-normal">
              {skill}
            </Badge>
          ))}
        </div>
      ) : null}

      {workRightLabel ? (
        <p className="mt-3 text-xs text-muted-foreground">Work rights: {workRightLabel}</p>
      ) : null}
    </div>
  );
}
