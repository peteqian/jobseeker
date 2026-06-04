import { describe, expect, it } from "bun:test";

import { extractJobDescription } from "./jobDescriptionText";

const SEEK_PAGE = `Skip to content
SEEK
Job search
People search
Career advice
Companies
Recruiters
Community
P
Employer site
Software Engineer
Facere AI
View all jobs
Sydney NSW
Engineering - Software (Information & Communication Technology)
Full time
Profile salary match
Posted 18h ago
•
Medium application volume
Quick apply
Save
About the Company

We’re a fast-growing startup transforming healthcare workflows with AI. Our platform helps medical practices reduce administrative workload and operate more efficiently by automating time-consuming processes.

About the Role

We’re looking for a Software Engineer to join our team and help build new product features used by real healthcare customers. This is a hands-on role suited to someone who enjoys solving real-world problems and delivering reliable, production-ready systems.

Key Responsibilities

Design, build and ship product features end-to-end.

Skills & Experience

Kotlin and/or Java (Spring Boot)

Employer questions
Your application will include the following questions:
Which of the following statements best describes your right to work in Australia?
Report this job advert
Be careful
Don’t provide your bank or credit card details when applying for jobs.
Featured jobs
Web Developer
Duo Group
What can I earn as a Software Engineer
Job seekers
Job search
SEEK sites
Employers
© SEEK. All rights reserved`;

describe("extractJobDescription", () => {
  it("strips SEEK header and footer chrome, keeping the description", () => {
    const result = extractJobDescription(SEEK_PAGE);
    expect(result.startsWith("About the Company")).toBe(true);
    expect(result).toContain("Key Responsibilities");
    expect(result).toContain("Kotlin and/or Java (Spring Boot)");
    expect(result).not.toContain("Quick apply");
    expect(result).not.toContain("Employer questions");
    expect(result).not.toContain("Report this job advert");
    expect(result).not.toContain("Featured jobs");
    expect(result).not.toContain("© SEEK");
  });

  it("leaves already-clean text untouched", () => {
    const clean = "About the Role\n\nWe need an engineer who ships. ".repeat(10).trim();
    expect(extractJobDescription(clean)).toBe(clean);
  });

  it("falls back to the raw text when heuristics would gut it", () => {
    const short = "Featured jobs\nOnly junk here";
    expect(extractJobDescription(short)).toBe(short);
  });
});
