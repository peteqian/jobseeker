import { formatExperiencePeriod } from "@jobseeker/contracts";
import type { StructuredProfile } from "@jobseeker/contracts";

/**
 * A compact, LLM-friendly view of the profile shared by the fit judge (apply)
 * and the match judge (explorer). Both need the same employment/skills/projects
 * digest, so it lives in one place.
 */
export function summarizeProfile(profile: StructuredProfile): string {
  const skills = profile.skills.map((s) => s.name).join(", ");
  const roles = profile.targeting.roles.map((r) => `${r.title} (${r.level})`).join(", ");
  return [
    profile.identity.headline ?? "",
    profile.identity.summary,
    profile.identity.yearsOfExperience
      ? `Years of experience: ${profile.identity.yearsOfExperience}`
      : "",
    skills ? `Skills: ${skills}` : "",
    roles ? `Target roles: ${roles}` : "",
    summarizeExperiences(profile.experiences),
    summarizeEducation(profile.education ?? []),
    summarizeProjects(profile.projects ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Formal qualifications. A real fit signal — degree/field/institution and when
 * it was earned — that recruiters and screening questions often ask for.
 */
export function summarizeEducation(education: NonNullable<StructuredProfile["education"]>): string {
  if (education.length === 0) return "";
  const lines = education.slice(0, 4).map((edu) => {
    const field = edu.field ? ` in ${edu.field}` : "";
    const when = edu.isCurrent ? " (in progress)" : edu.endDate ? ` (${edu.endDate})` : "";
    const where = edu.institution ? `, ${edu.institution}` : "";
    return `- ${edu.degree}${field}${where}${when}`;
  });
  return ["Education:", ...lines].join("\n");
}

/**
 * Side projects are supplementary signal — they show skill breadth the résumé
 * may not, so include them but keep them clearly separate from paid work.
 */
export function summarizeProjects(projects: NonNullable<StructuredProfile["projects"]>): string {
  if (projects.length === 0) return "";
  const lines = projects.slice(0, 6).map((project) => {
    const skills = project.skillsUsed.length ? ` — skills: ${project.skillsUsed.join(", ")}` : "";
    return `- ${project.name}: ${project.description}${skills}`;
  });
  return ["Side projects (not paid work):", ...lines].join("\n");
}

/**
 * Employment history is the strongest fit signal, so it must reach the judge.
 * Compact lines per role: title @ company (duration), top achievements, skills.
 */
export function summarizeExperiences(experiences: StructuredProfile["experiences"]): string {
  if (experiences.length === 0) return "";
  const lines = experiences.slice(0, 8).map((exp) => {
    const period = formatExperiencePeriod(exp);
    const head = period
      ? `- ${exp.title} @ ${exp.company} (${period})`
      : `- ${exp.title} @ ${exp.company}`;
    const achievements = exp.achievements.slice(0, 3).map((a) => `    • ${a}`);
    const used = exp.skillsUsed.length ? `    skills: ${exp.skillsUsed.join(", ")}` : "";
    return [head, ...achievements, used].filter(Boolean).join("\n");
  });
  return ["Experience:", ...lines].join("\n");
}
