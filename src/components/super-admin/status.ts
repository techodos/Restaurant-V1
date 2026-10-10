/**
 * Status -> badge tone + label. Plain functions (no "use client"), so server components such as the restaurant layout can
 * call them; `StatusBadge` (ui.tsx) renders the result.
 */

export type StatusTone = "success" | "neutral" | "warning" | "danger" | "info" | "brand";

/** restaurants.status */
export function restaurantStatusTone(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case "active":
      return { tone: "success", label: "Active" };
    case "onboarding":
      return { tone: "warning", label: "Onboarding" };
    case "suspended":
      return { tone: "danger", label: "Suspended" };
    default:
      return { tone: "neutral", label: status.charAt(0).toUpperCase() + status.slice(1) };
  }
}

/** websites.status */
export function websiteStatusTone(status: string): { tone: StatusTone; label: string } {
  if (status === "published") return { tone: "success", label: "Published" };
  if (status === "disabled") return { tone: "danger", label: "Disabled" };
  return { tone: "neutral", label: "Draft" };
}
