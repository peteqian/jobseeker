interface MatchTier {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  toneClass: string;
}

export function getMatchTier(score: number): MatchTier {
  if (score >= 0.85)
    return { label: "Excellent match", variant: "default", toneClass: "text-emerald-600" };
  if (score >= 0.7)
    return { label: "Strong match", variant: "default", toneClass: "text-green-600" };
  if (score >= 0.5)
    return { label: "Good match", variant: "secondary", toneClass: "text-amber-600" };
  if (score >= 0.3)
    return { label: "Partial match", variant: "outline", toneClass: "text-orange-600" };
  return { label: "Weak match", variant: "outline", toneClass: "text-muted-foreground" };
}
