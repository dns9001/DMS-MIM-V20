import api from "./api";

const QUEUE_KEY = "mhm_offline_queue";
const VISIT_KEY = "mhm_active_visit";

function getQueue() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  window.dispatchEvent(new CustomEvent("mhm-queue"));
}

export function pendingCount() {
  return getQueue().length;
}

export function getLocalVisit() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLocalVisit(visit) {
  if (typeof window === "undefined") return;
  if (!visit) {
    localStorage.removeItem(VISIT_KEY);
  } else {
    localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  }
}

export async function postQueued(url, data = {}) {
  // If browser is online, try posting directly
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const res = await api.post(url, data);
      return res.data;
    } catch (err) {
      // If it's a server validation error (4xx), throw it so user gets feedback
      if (err?.response?.status && err.response.status < 500) {
        throw err;
      }
      // If network error (5xx or connection fail), queue it
      console.warn("Network error during post, saving to offline queue:", err.message);
    }
  }

  // Queue offline action
  const queue = getQueue();
  const item = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    url,
    data,
    timestamp: new Date().toISOString(),
  };
  queue.push(item);
  saveQueue(queue);

  // If this was an active visit check-in, save local visit representation
  if (url.includes("/visits/check-in")) {
    setLocalVisit({
      _id: "@local",
      local: true,
      outlet_id: data.outlet_id,
      check_in_time: new Date().toISOString(),
      status: "VISITING",
      ...data,
    });
  } else if (url.includes("/check-out")) {
    setLocalVisit(null);
  }

  return { offline: true, queuedId: item.id };
}

export async function flushQueue() {
  const queue = getQueue();
  if (!queue.length) return { success: true, count: 0 };

  const remaining = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      await api.post(item.url, item.data);
      flushed++;
    } catch (err) {
      console.warn("Gagal flush offline item:", item.id, err);
      // Keep in queue if network error, drop if invalid payload (4xx)
      if (!err?.response || err.response.status >= 500) {
        remaining.push(item);
      }
    }
  }

  saveQueue(remaining);
  return { success: true, flushed, remaining: remaining.length };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushQueue().catch((e) => console.warn("Auto-flush queue error:", e));
  });
}
