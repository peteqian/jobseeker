# Jobseeker

Jobseeker is an AI-assisted job application tool.

It starts by taking in your resume, then asks follow-up questions to build a deeper character profile around your experience, strengths, preferences, and story. The goal is to understand you well enough that the system can personalize the entire job-seeking process instead of relying only on the text in a single resume.

Once that profile is built, Jobseeker searches for relevant roles across job boards, company sites, and related sources so you do not have to manually filter opportunities yourself. For jobs that fit your profile, it can generate a tailored resume and a targeted cover letter based on the job description and your additional instructions.

Application materials are stored in the system and can be downloaded in the format you need, such as PDF, so you can review them, apply directly, or use them as a starting point for your own edits.

The app is designed to support:

- resume upload and intake
- deep profile building through AI-guided questions
- job discovery across relevant sites and domains
- tailored resume generation for specific job descriptions
- customizable cover letter generation
- exportable application materials

## Repository Structure

This project is organized as a monorepo:

- `apps/web`: React + Vite frontend for the job search and document tailoring workflow
- `apps/server`: Bun + Hono backend for API routes, resume ingestion, and supporting services
- `packages/contracts`: shared types and contracts used across the apps

## Development

Install dependencies with Bun, then run the apps from the workspace root.

```bash
bun install
bun dev
```

Useful root commands:

```bash
bun fmt
bun lint
bun typecheck
```
