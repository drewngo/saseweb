export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export const fmtDate = (iso, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(iso).toLocaleDateString(undefined, opts);

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function fmtTimeRange(ev) {
  return ev.ends_at ? `${fmtTime(ev.starts_at)} – ${fmtTime(ev.ends_at)}` : fmtTime(ev.starts_at);
}

// Date -> value for <input type="datetime-local">, in local time.
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function googleCalendarLink(ev) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const end = ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 36e5).toISOString();
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${stamp(ev.starts_at)}/${stamp(end)}`,
    details: ev.description || "",
    location: ev.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const CATEGORIES = ["general", "professional", "social", "service", "cultural"];

export function eventCard(ev, { compact = false } = {}) {
  const d = new Date(ev.starts_at);
  return `
    <article class="event-card cat-${esc(ev.category)}">
      <div class="event-date" aria-hidden="true">
        <span class="month">${d.toLocaleDateString(undefined, { month: "short" })}</span>
        <span class="day">${d.getDate()}</span>
      </div>
      <div class="event-body">
        <h3>${esc(ev.title)}</h3>
        <p class="event-meta">
          ${esc(fmtDate(ev.starts_at))} · ${esc(fmtTimeRange(ev))}${ev.location ? ` · ${esc(ev.location)}` : ""}
        </p>
        ${!compact && ev.description ? `<p class="event-desc">${esc(ev.description)}</p>` : ""}
        <div class="event-tags">
          <span class="tag">${esc(ev.category)}</span>
          ${ev.points ? `<span class="tag tag-points">+${ev.points} pts</span>` : ""}
          ${!compact ? `<a class="tag tag-link" href="${esc(googleCalendarLink(ev))}" target="_blank" rel="noopener">Add to Google Calendar</a>` : ""}
        </div>
      </div>
    </article>`;
}

export function showError(el, err) {
  console.error(err);
  el.innerHTML = `<p class="notice notice-error">Couldn't load data: ${esc(err.message)}</p>`;
}
