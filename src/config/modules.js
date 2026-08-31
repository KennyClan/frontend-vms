// ─── MODULE PERMISSIONS ──────────────────────────────────────────
// Single source of truth for which nav pages each role can access.
// Administrator (and Super Admin) can fine-tune per-account access via
// the checkboxes in Staff Management — the saved list is sent to the
// backend which enforces it with 403s (routers/*.py require_modules).

export const MODULES = {
  dashboard:        { label: "Dashboard", icon: "📊" },
  visitors:         { label: "Visitor History", icon: "👥" },
  requests:         { label: "Visit Requests", icon: "📋" },
  security:         { label: "Security Desk", icon: "🔒" },
  myroom:           { label: "My Room", icon: "🏠" },
  analytics:        { label: "Analytics", icon: "📈" },
  audit:            { label: "Audit Log", icon: "📜" },
  restricted:       { label: "Restricted Areas", icon: "🔒" },
  staff:            { label: "Staff", icon: "👤" },
  departments:      { label: "Departments", icon: "🏢" },
  floorplan:        { label: "Floor Plan", icon: "🗺️" },
  "visitor-history":{ label: "Visitor History", icon: "👥" },
  badges:           { label: "Badge Registry", icon: "🪪" },
};

// Sidebar/nav ordering
export const MODULE_ORDER = [
  "dashboard", "visitors", "requests", "security", "myroom",
  "analytics", "audit", "restricted", "staff", "departments",
  "floorplan", "visitor-history", "badges",
];

// Role defaults — mirrors backend DEFAULT_MODULES_BY_ROLE in models.py
export const DEFAULT_MODULES_BY_ROLE = {
  "Super Admin": [
    "dashboard", "visitors", "requests", "security", "myroom",
    "analytics", "audit", "restricted", "staff", "departments", "floorplan", "badges",
  ],
  "Administrator": [
    "dashboard", "visitors", "requests", "security",
    "analytics", "audit", "restricted", "staff", "departments", "floorplan", "badges",
  ],
  "Receptionist": ["dashboard", "visitors", "requests", "security", "analytics", "audit", "floorplan", "badges"],
  "Security Guard": ["dashboard", "myroom"],
  "Employee": ["dashboard", "requests", "visitor-history"],
};

// Role-aware display labels (e.g. Employee calls "requests" → "My Visit Requests")
export const NAV_LABELS_BY_ROLE = {
  Employee: { requests: "My Visit Requests" },
};

// Best-effort parse of the backend's stored permissions value.
// Legacy rows are either absent, an empty string, or a JSON string.
export function parsePermissions(raw) {
  let parsed = raw;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  return Array.isArray(parsed) ? parsed.filter(m => m in MODULES) : [];
}

// Effective permission list for a user — stored value wins over the role
// default so an Administrator's manual toggles stay in effect, falling
// back to the role default for accounts never customised.
export function effectivePermissions(user) {
  if (!user || !user.role) return [];
  if (user.role === "Super Admin") return DEFAULT_MODULES_BY_ROLE["Super Admin"].slice();
  const list = parsePermissions(user.permissions);
  const base = [...DEFAULT_MODULES_BY_ROLE[user.role] || []];
  const out = list.length ? list : base;
  if (!out.includes("dashboard")) out.push("dashboard");
  // Badge Registry is role-scoped only (Admin / Super Admin / Receptionist
  // per spec) — always show it even if an account's stored permission list
  // predates the module, so stale toggles can't hide the panel.
  if (["Administrator", "Super Admin", "Receptionist"].includes(user.role) && !out.includes("badges")) {
    out.push("badges");
  }
  // Same role-scoped rule for the Security Desk (front desk) — always show
  // it for front-desk staff even if their stored list predates the module.
  if (["Administrator", "Super Admin", "Receptionist"].includes(user.role) && !out.includes("security")) {
    out.push("security");
  }
  return out;
}

export function hasModule(user, id) {
  return user && effectivePermissions(user).includes(id);
}

// Problem-child modules that still carry role restrictions server-side.
// A module tick alone isn't enough to unlock these pages for every role.
export function ROLE_MODULE_GUARD(user, pageId) {
  const role = user?.role;
  switch (pageId) {
    case "dashboard": return true;
    case "visitors": case "requests": case "analytics":
      return hasModule(user, pageId) && ["Administrator", "Super Admin", "Receptionist", "Employee"].includes(role);
    case "security":
      // Front Desk guards (Security Desk) scan the visitor QR and issue
      // badges; Room Guard badge-scanning happens under "myroom" instead.
      return hasModule(user, "security") && ["Administrator", "Super Admin", "Receptionist", "Security Guard"].includes(role);
    case "myroom":
      return hasModule(user, "myroom") && ["Security Guard", "Super Admin"].includes(role);
    case "audit":
      return hasModule(user, "audit") && ["Administrator", "Super Admin", "Receptionist"].includes(role);
    case "restricted":
      return hasModule(user, "restricted") && ["Administrator", "Super Admin", "Receptionist"].includes(role);
    case "staff":
      return hasModule(user, "staff") && ["Administrator", "Super Admin"].includes(role);
    case "departments":
      return hasModule(user, "departments") && ["Administrator", "Super Admin"].includes(role);
    case "floorplan":
      return hasModule(user, "floorplan") && ["Administrator", "Super Admin", "Receptionist", "Security Guard"].includes(role);
    case "visitor-history":
      return hasModule(user, "visitor-history") && ["Employee", "Super Admin"].includes(role);
    case "badges":
      // Role scoped per spec — stored permission toggles do not apply.
      // Front Desk guards get the read-only registry so they can pick the
      // next available badge number when issuing at the Security Desk.
      return ["Administrator", "Super Admin", "Receptionist", "Security Guard"].includes(role);
    default:
      return false;
  }
}

// Build the sidebar nav from the user's effective modules, honouring
// role-aware labels.
export function roleNav(user) {
  if (!user || !user.role) return [];
  const perms = effectivePermissions(user);
  const labels = NAV_LABELS_BY_ROLE[user.role] || {};
  return MODULE_ORDER
    .filter(id => perms.includes(id) && ROLE_MODULE_GUARD(user, id))
    .map(id => ({ id, label: labels[id] || MODULES[id].label, icon: MODULES[id].icon }));
}