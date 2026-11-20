/** Badges a workspace can show on the branching map. */
export const WORKSPACE_ICONS = [
  "folder_open",
  "folder",
  "grid_view",
  "note_add",
  "difference",
  "forum",
  "tune",
  "dashboard",
] as const;

export type WorkspaceIcon = (typeof WORKSPACE_ICONS)[number];

export const DEFAULT_WORKSPACE_ICON: WorkspaceIcon = "folder_open";

/** Accessible names for the palette; the glyph names are not readable prose. */
export const WORKSPACE_ICON_LABELS: Record<WorkspaceIcon, string> = {
  folder_open: "Folder",
  folder: "Closed folder",
  grid_view: "Grid",
  note_add: "Notes",
  difference: "Changes",
  forum: "Conversation",
  tune: "Tune",
  dashboard: "Dashboard",
};

const STORAGE_KEY = "agentica.workspaceIcons";

function isWorkspaceIcon(value: unknown): value is WorkspaceIcon {
  return WORKSPACE_ICONS.includes(value as WorkspaceIcon);
}

/**
 * Chosen badges by workspace id. This is a viewing preference like theme and
 * layout, so it stays on this device; unknown icons are dropped.
 */
export function readWorkspaceIcons(): Record<string, WorkspaceIcon> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (typeof parsed !== "object" || parsed === null) return {};
    const icons: Record<string, WorkspaceIcon> = {};
    for (const [id, icon] of Object.entries(parsed)) {
      if (isWorkspaceIcon(icon)) icons[id] = icon;
    }
    return icons;
  } catch {
    // Storage can be unavailable or hold older shapes; use the defaults.
    return {};
  }
}

/** Remember every chosen badge; false when storage rejected the write. */
export function saveWorkspaceIcons(
  icons: Record<string, WorkspaceIcon>,
): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
    return true;
  } catch {
    return false;
  }
}
