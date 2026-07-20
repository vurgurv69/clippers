/**
 * Local team roles for Growth Hub cloud approvals (Phase 6).
 * Stored in localStorage — no auth server required.
 */

export type TeamRole = "admin" | "editor" | "reviewer";

export const TEAM_ROLES: { id: TeamRole; label: string; hint: string }[] = [
  { id: "admin", label: "Admin", hint: "Sync, request, and approve" },
  { id: "editor", label: "Editor", hint: "Sync + request review" },
  { id: "reviewer", label: "Reviewer", hint: "Approve / reject only" },
];

const STORAGE_KEY = "clippers-team-role";
const NAME_KEY = "clippers-team-name";

export function loadTeamRole(): TeamRole {
  if (typeof window === "undefined") return "editor";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "admin" || v === "editor" || v === "reviewer") return v;
  } catch {
    // ignore
  }
  return "editor";
}

export function saveTeamRole(role: TeamRole) {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // ignore
  }
}

export function loadTeamName(): string {
  if (typeof window === "undefined") return "Editor";
  try {
    return localStorage.getItem(NAME_KEY) || "Editor";
  } catch {
    return "Editor";
  }
}

export function saveTeamName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 40) || "Editor");
  } catch {
    // ignore
  }
}

export function canRequestApproval(role: TeamRole): boolean {
  return role === "admin" || role === "editor";
}

export function canResolveApproval(role: TeamRole): boolean {
  return role === "admin" || role === "reviewer";
}

export function canCloudSync(role: TeamRole): boolean {
  return role === "admin" || role === "editor";
}
