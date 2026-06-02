/**
 * The instruction given to the apply agent. The browser is already on the job
 * page and logged into SEEK.
 */
export function buildApplyTask(): string {
  return [
    "You are applying to the job currently open in the browser. The user is already logged into SEEK.",
    "",
    "Steps:",
    "1. Click the Apply or Quick Apply button to start the application. If it redirects to an external careers site (e.g. Workday, Lever, Greenhouse), continue the application there.",
    "2. Work through the form. For EVERY question, first call lookup_answer with the question's visible label.",
    "   - If it returns a stored answer, fill the field with that value exactly.",
    "   - If it returns none, draft a concise, honest answer from the page context, fill it, then call record_answer with the same label and the answer you used.",
    "3. Select the candidate's existing resume/CV when the form offers it. Do not upload new files.",
    "4. When every required field is filled and the form is ready, call request_human_submit with a short summary of what you entered.",
    "",
    "Hard rules:",
    "- NEVER click a final Submit, Send, or Confirm application button. Submitting is the human's job.",
    "- Do not invent qualifications. Draft only from the candidate's stored data and the page.",
    "- Stop by calling request_human_submit; do not call done for a completed form.",
  ].join("\n");
}
