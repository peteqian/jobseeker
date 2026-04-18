import type { QuestionCardSections } from "@jobseeker/contracts";

export interface QuestionCardTemplate {
  slug: string;
  title: string;
  prompt: string;
  source: "resume_analysis";
  sections: QuestionCardSections;
}

export function buildQuestionCardTemplates(resumeText: string): QuestionCardTemplate[] {
  const normalized = resumeText.toLowerCase();
  const hasAngular = normalized.includes("angular");
  const hasReact = normalized.includes("react");
  const hasSchema = normalized.includes("json schema") || normalized.includes("form builder");
  const hasMentoring =
    normalized.includes("mentor") ||
    normalized.includes("review") ||
    normalized.includes("coaching");
  const hasTheming = normalized.includes("theme") || normalized.includes("branding");
  const hasMetadata = normalized.includes("metadata");

  const templates: QuestionCardTemplate[] = [
    {
      slug: "target-role-positioning",
      title: "Target role positioning",
      prompt:
        "Which roles should this resume target first, and what supporting evidence is still missing for senior Angular, React, or tech-lead variants?",
      source: "resume_analysis",
      sections: {
        currentAnswer: "",
        evidenceSoFar: [
          hasAngular
            ? "The resume already shows strong Angular and TypeScript signal in shipped product work."
            : "The resume needs clearer Angular or TypeScript evidence if those are primary targets.",
          hasReact
            ? "React appears in the resume, but the evidence likely needs to be separated into personal-project depth versus enterprise experience."
            : "React is not strongly evidenced yet, so React-heavy roles may need more supporting proof.",
        ],
        whyItMatters: [
          "A senior resume works better when it has one primary story instead of trying to sell every possible role equally.",
          "Clear positioning makes it easier to decide which follow-up cards matter most.",
        ],
        pushback: [
          "Do not overclaim React or formal tech-lead depth if the stronger evidence is still Angular and TypeScript delivery.",
        ],
        followUpQuestions: [
          "Which role title should be the primary target right now?",
          "What proof should be added or removed to support that target honestly?",
        ],
        resumeAngles: [
          "Senior Angular and TypeScript engineer with strong product delivery and shared frontend architecture experience.",
          "Senior frontend engineer with Angular-first depth and enough React fluency for the right team fit, if supported by stronger examples.",
        ],
        conversation: [
          "Generated from resume analysis to anchor the overall direction before deeper experience questions.",
        ],
      },
    },
  ];

  if (hasSchema) {
    templates.push({
      slug: "shared-frontend-architecture",
      title: "Shared frontend architecture",
      prompt:
        "Did you define a shared contract, extension model, or default pattern that other applications relied on rather than building one-off UI flows?",
      source: "resume_analysis",
      sections: {
        currentAnswer: "",
        evidenceSoFar: [
          "The resume mentions a JSON Schema form builder or reusable form platform, which suggests architecture beyond a single feature.",
          "This may be strongest if the contract or component model became the default path across multiple applications.",
        ],
        whyItMatters: [
          "Shared contracts and reusable extension points are stronger senior-level evidence than isolated feature work.",
        ],
        pushback: [
          "A reusable component alone is not enough; the architecture story needs scope, adoption, and tradeoffs.",
        ],
        followUpQuestions: [
          "What contract did you define that other engineers or apps depended on?",
          "What manual or repetitive approach did it replace?",
          "How many applications actually adopted it?",
        ],
        resumeAngles: [
          "Defined a shared contract for schema-driven forms that replaced repeated app-specific implementations.",
        ],
        conversation: [
          "This card should capture the strongest reusable-platform example from the resume.",
        ],
      },
    });
  }

  templates.push({
    slug: "mentoring-and-standards",
    title: "Mentoring and standards",
    prompt:
      "Where have you raised code quality, review standards, or mentoring signal in ways that made the team more effective rather than just improving your own code?",
    source: "resume_analysis",
    sections: {
      currentAnswer: "",
      evidenceSoFar: [
        hasMentoring
          ? "The resume already hints at mentoring or review-related influence, but it likely needs a more concrete example."
          : "The resume does not strongly show mentoring or standards-setting yet, so this is a likely gap for senior roles.",
      ],
      whyItMatters: [
        "Senior hiring loops look for technical influence beyond individual implementation speed.",
      ],
      pushback: [
        "One-off code review feedback is useful but should not be inflated into broad leadership without proof of adoption.",
      ],
      followUpQuestions: [
        "Did your guidance become a repeated pattern or team convention?",
        "Did it reduce review churn, bugs, or wasted API calls?",
      ],
      resumeAngles: [
        "Mentored engineers on maintainable frontend patterns and review standards that improved clarity and prevented unnecessary work.",
      ],
      conversation: [
        "Use this card for examples like guard clauses, early exits, review guidance, or other documented frontend best practices.",
      ],
    },
  });

  if (hasReact) {
    templates.push({
      slug: "react-depth",
      title: "React depth",
      prompt:
        "If React remains a target, what evidence can support it honestly without overstating enterprise React experience?",
      source: "resume_analysis",
      sections: {
        currentAnswer: "",
        evidenceSoFar: [
          "React appears in the resume, but the strongest delivery signal still seems to come from Angular-based work.",
        ],
        whyItMatters: [
          "React-heavy roles will screen for concrete React examples, not just skills-list mentions.",
        ],
        pushback: [
          "If the strongest React work is personal or exploratory, keep the claim narrow and credible.",
        ],
        followUpQuestions: [
          "What React projects best show architecture, performance, or product-quality decisions?",
          "Would a separate Angular-first resume be stronger than a blended one?",
        ],
        resumeAngles: [
          "Angular-first senior engineer with practical React experience, targeted where product fit matters more than framework purity.",
        ],
        conversation: [
          "This card exists because React is mentioned, but the supporting evidence may need more curation.",
        ],
      },
    });
  }

  if (hasTheming) {
    templates.push({
      slug: "theming-and-white-labeling",
      title: "Theming and white-labeling",
      prompt:
        "Was the theming work mainly UI styling, or did it create a reusable product customization model that others relied on?",
      source: "resume_analysis",
      sections: {
        currentAnswer: "",
        evidenceSoFar: [
          "The resume mentions theming or branding, which may point to build-time customization rather than only visual polish.",
        ],
        whyItMatters: [
          "Customization and white-labeling work can show product thinking and reusable architecture.",
        ],
        pushback: [
          "Do not describe this as a design system unless the work truly included broader tokens, components, and usage standards.",
        ],
        followUpQuestions: [
          "How did teams configure the theme?",
          "Did it remove code changes for branded variants?",
        ],
        resumeAngles: [
          "Built a build-time theming model that allowed branded variants without modifying application code.",
        ],
        conversation: [
          "Use this card only if the theming work was real product customization rather than ad hoc CSS changes.",
        ],
      },
    });
  }

  if (hasMetadata) {
    templates.push({
      slug: "live-metadata-tooling",
      title: "Live metadata tooling",
      prompt:
        "Did the metadata editing work reduce developer dependency by giving non-engineers a safe way to update complex configuration?",
      source: "resume_analysis",
      sections: {
        currentAnswer: "",
        evidenceSoFar: [
          "The resume mentions metadata-related work, which could support an internal tooling story.",
        ],
        whyItMatters: [
          "Internal tooling that removes operational bottlenecks is strong senior full-stack signal.",
        ],
        pushback: [
          "Focus on the user, problem, and outcome rather than naming a transport layer unless it was central to the contribution.",
        ],
        followUpQuestions: [
          "Who used the tool?",
          "What problem did it let them solve without engineering help?",
        ],
        resumeAngles: [
          "Built internal tooling that let non-engineers resolve document-configuration issues without developer escalation.",
        ],
        conversation: [
          "This card should stay grounded in the actual workflow and user outcome, not implementation jargon.",
        ],
      },
    });
  }

  return templates;
}
