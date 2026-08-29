import type { OutletLifecycleStatus } from "./outletStatus.service.js";

/** Normalize legacy labels at API/UI boundaries without changing the legacy data model. */
export function normalizeOutletLifecycleStatus(value: unknown): OutletLifecycleStatus | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim().toUpperCase();
  switch (normalized) {
    case "NOO":
      return "NOO";
    case "REPEAT":
      return "Repeat";
    case "ACTIVE":
      return "Active";
    case "DORMANT":
      return "Dormant";
    case "PROSPECT":
      // Prospect is legacy-only; canonical lifecycle has no prospect state.
      return "NOO";
    default:
      return undefined;
  }
}

export function normalizeOutletLifecycle<T extends Record<string, any>>(outlet: T): T & { lifecycle_status?: OutletLifecycleStatus } {
  const status = normalizeOutletLifecycleStatus(outlet.lifecycle_status);
  return status ? { ...outlet, lifecycle_status: status } : outlet;
}

export function normalizeOutletLifecycles<T extends Record<string, any>>(outlets: T[]) {
  return outlets.map(normalizeOutletLifecycle);
}
