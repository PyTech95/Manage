export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function formatDateTime(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "—";
  }
}
