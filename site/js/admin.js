import * as db from "./data.js";
import { esc, fmtDate, fmtTimeRange, toLocalInput, CATEGORIES } from "./util.js";

const $ = (sel) => document.querySelector(sel);
const views = { login: $("#login-view"), denied: $("#denied-view"), admin: $("#admin-view") };

let members = [];
let events = [];
let history = [];
let allTimeTotals = new Map();

function show(name) {
  for (const [k, el] of Object.entries(views)) el.classList.toggle("hidden", k !== name);
}

function flash(message, kind = "success") {
  const el = $("#flash");
  el.innerHTML = `<p class="notice notice-${kind}">${esc(message)}</p>`;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (el.innerHTML = ""), 5000);
}

async function guarded(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    flash(err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function boot() {
  if (db.isDemo) {
    $("#login-hint").textContent = "Demo mode: any email/password works and changes reset on reload.";
    $("#password").required = false;
  }
  const session = await db.getSession();
  if (!session) return show("login");
  if (!(await db.isAdmin())) {
    $("#denied-email").textContent = session.user.email;
    return show("denied");
  }
  $("#who").textContent = session.user.email;
  show("admin");
  await reloadAll();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-msg").innerHTML = "";
  try {
    await db.signIn($("#email").value.trim(), $("#password").value);
    await boot();
  } catch (err) {
    $("#login-msg").innerHTML = `<p class="notice notice-error">${esc(err.message)}</p>`;
  }
});

document.querySelectorAll("[data-signout]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    await db.signOut();
    show("login");
  })
);

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll("[data-tab]").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    document.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab.dataset.tab));
  })
);

async function reloadAll() {
  await guarded(async () => {
    let board;
    [members, events, history, board] = await Promise.all([
      db.listMembers(), db.listEvents(), db.recentEntries(500), db.leaderboard(null),
    ]);
    allTimeTotals = new Map(board.map((r) => [r.member_id, r.total_points]));
    renderAwardEventOptions();
    renderPicker();
    renderEvents();
    renderMembers();
    renderHistory();
  });
}

// ---------------------------------------------------------------------------
// Award points
// ---------------------------------------------------------------------------

const picked = new Set();

function renderAwardEventOptions() {
  const sel = $("#award-event");
  const prev = sel.value;
  // Most recent events first, since you usually award right after an event.
  const sorted = [...events].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  sel.innerHTML =
    `<option value="">— No event (manual award) —</option>` +
    sorted.map((e) => `<option value="${e.id}">${esc(fmtDate(e.starts_at, { month: "short", day: "numeric" }))} · ${esc(e.title)}</option>`).join("");
  if (prev && sorted.some((e) => e.id === prev)) {
    sel.value = prev;
  } else {
    // Default to the most recent event that has already started.
    const recent = sorted.find((e) => new Date(e.starts_at) <= new Date());
    sel.value = recent ? recent.id : "";
    syncAwardPoints();
  }
}

function syncAwardPoints() {
  const ev = events.find((e) => e.id === $("#award-event").value);
  $("#award-points").value = ev ? ev.points : "";
  renderPicker();
}

$("#award-event").addEventListener("change", syncAwardPoints);

function creditedForSelectedEvent() {
  const eventId = $("#award-event").value;
  if (!eventId) return new Set();
  return new Set(history.filter((p) => p.event_id === eventId).map((p) => p.member_id));
}

function shownPickerMembers() {
  const q = $("#award-search").value.trim().toLowerCase();
  return members.filter((m) => m.active && (!q || m.name.toLowerCase().includes(q)));
}

function renderPicker() {
  const credited = creditedForSelectedEvent();
  $("#member-picker").innerHTML =
    shownPickerMembers()
      .map((m) => {
        const done = credited.has(m.id);
        return `<label class="${done ? "already" : ""}">
          <input type="checkbox" value="${m.id}" ${picked.has(m.id) ? "checked" : ""} ${done ? "disabled" : ""} />
          <span>${esc(m.name)}${done ? " · already credited" : ""}</span>
        </label>`;
      })
      .join("") || `<p class="muted" style="padding:12px;">No members. Add some in the Members tab.</p>`;
  $("#selected-count").textContent = `${picked.size} selected`;
}

$("#member-picker").addEventListener("change", (e) => {
  if (e.target.checked) picked.add(e.target.value);
  else picked.delete(e.target.value);
  $("#selected-count").textContent = `${picked.size} selected`;
});
$("#award-search").addEventListener("input", renderPicker);
$("#select-all").addEventListener("click", () => {
  const credited = creditedForSelectedEvent();
  shownPickerMembers().forEach((m) => !credited.has(m.id) && picked.add(m.id));
  renderPicker();
});
$("#select-none").addEventListener("click", () => {
  picked.clear();
  renderPicker();
});

$("#award-form").addEventListener("submit", (e) => {
  e.preventDefault();
  guarded(async () => {
    const event_id = $("#award-event").value || null;
    const points = parseInt($("#award-points").value, 10);
    const reason = $("#award-reason").value.trim() || null;
    if (!picked.size) throw new Error("Select at least one member.");
    if (!Number.isFinite(points) || points === 0) throw new Error("Enter a non-zero number of points.");
    if (!event_id && !reason) throw new Error("Add a reason for manual awards.");

    $("#award-submit").disabled = true;
    try {
      const n = await db.awardPoints([...picked].map((member_id) => ({ member_id, event_id, points, reason })));
      const skipped = picked.size - n;
      flash(`Awarded ${points} pts to ${n} member(s).${skipped ? ` Skipped ${skipped} already credited.` : ""}`);
      picked.clear();
      $("#award-reason").value = "";
      await reloadAll();
    } finally {
      $("#award-submit").disabled = false;
    }
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

$("#ev-category").innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`).join("");

function renderEvents() {
  const filter = $("#ev-filter").value;
  const now = new Date();
  let list = events.filter((e) =>
    filter === "all" ? true : filter === "upcoming" ? new Date(e.ends_at || e.starts_at) >= now : new Date(e.starts_at) < now
  );
  if (filter !== "upcoming") list = [...list].reverse();
  $("#event-rows").innerHTML =
    list
      .map((e) => `
        <tr>
          <td>
            <strong>${esc(e.title)}</strong>
            <div class="muted" style="font-size:.85rem;">${esc(fmtDate(e.starts_at))} · ${esc(fmtTimeRange(e))}${e.location ? ` · ${esc(e.location)}` : ""}</div>
            <div class="event-tags" style="margin-top:4px;"><span class="tag">${esc(e.category)}</span><span class="tag tag-points">+${e.points} pts</span></div>
          </td>
          <td class="row-actions">
            <button class="btn btn-ghost btn-sm" data-edit-event="${e.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-event="${e.id}">Delete</button>
          </td>
        </tr>`)
      .join("") || `<tr><td class="muted">No events.</td></tr>`;
}

$("#ev-filter").addEventListener("change", renderEvents);

function resetEventForm() {
  $("#event-form").reset();
  $("#ev-id").value = "";
  $("#ev-points").value = 10;
  $("#event-form-title").textContent = "New event";
}
$("#ev-cancel").addEventListener("click", resetEventForm);

$("#event-rows").addEventListener("click", (e) => {
  const editId = e.target.dataset.editEvent;
  const delId = e.target.dataset.deleteEvent;
  if (editId) {
    const ev = events.find((x) => x.id === editId);
    $("#ev-id").value = ev.id;
    $("#ev-title").value = ev.title;
    $("#ev-start").value = toLocalInput(ev.starts_at);
    $("#ev-end").value = toLocalInput(ev.ends_at);
    $("#ev-location").value = ev.location || "";
    $("#ev-category").value = ev.category;
    $("#ev-points").value = ev.points;
    $("#ev-desc").value = ev.description || "";
    $("#event-form-title").textContent = "Edit event";
    $("#event-form").scrollIntoView({ behavior: "smooth" });
  }
  if (delId) {
    const ev = events.find((x) => x.id === delId);
    if (!confirm(`Delete "${ev.title}"? Points already awarded for it are kept but no longer linked to the event.`)) return;
    guarded(async () => {
      await db.deleteEvent(delId);
      flash("Event deleted.");
      await reloadAll();
    });
  }
});

$("#event-form").addEventListener("submit", (e) => {
  e.preventDefault();
  guarded(async () => {
    const start = new Date($("#ev-start").value);
    const end = $("#ev-end").value ? new Date($("#ev-end").value) : null;
    if (end && end < start) throw new Error("End time is before start time.");
    const ev = {
      title: $("#ev-title").value.trim(),
      starts_at: start.toISOString(),
      ends_at: end ? end.toISOString() : null,
      location: $("#ev-location").value.trim() || null,
      category: $("#ev-category").value,
      points: parseInt($("#ev-points").value, 10) || 0,
      description: $("#ev-desc").value.trim() || null,
    };
    if ($("#ev-id").value) ev.id = $("#ev-id").value;
    await db.saveEvent(ev);
    flash(ev.id ? "Event updated." : "Event created.");
    resetEventForm();
    await reloadAll();
  });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function renderMembers() {
  const q = $("#member-search").value.trim().toLowerCase();
  $("#member-rows").innerHTML =
    members
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => `
        <tr>
          <td>
            <strong>${esc(m.name)}</strong>${m.active ? "" : ` <span class="tag">hidden</span>`}
            <div class="muted" style="font-size:.85rem;">${esc([m.major, m.class_year].filter(Boolean).join(" · ") || "—")}</div>
          </td>
          <td class="num">${allTimeTotals.has(m.id) ? `${allTimeTotals.get(m.id)} pts` : "—"}</td>
          <td class="row-actions">
            <button class="btn btn-ghost btn-sm" data-edit-member="${m.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-member="${m.id}">Delete</button>
          </td>
        </tr>`)
      .join("") || `<tr><td class="muted">No members.</td></tr>`;
}

$("#member-search").addEventListener("input", renderMembers);

function resetMemberForm() {
  $("#member-form").reset();
  $("#m-id").value = "";
  $("#m-active").checked = true;
  $("#member-form-title").textContent = "Add member";
}
$("#m-cancel").addEventListener("click", resetMemberForm);

$("#member-rows").addEventListener("click", (e) => {
  const editId = e.target.dataset.editMember;
  const delId = e.target.dataset.deleteMember;
  if (editId) {
    const m = members.find((x) => x.id === editId);
    $("#m-id").value = m.id;
    $("#m-name").value = m.name;
    $("#m-major").value = m.major || "";
    $("#m-year").value = m.class_year || "";
    $("#m-active").checked = m.active;
    $("#member-form-title").textContent = "Edit member";
    $("#member-form").scrollIntoView({ behavior: "smooth" });
  }
  if (delId) {
    const m = members.find((x) => x.id === delId);
    if (!confirm(`Delete ${m.name} and ALL of their points? To just hide them from the leaderboard, edit and uncheck "Show on leaderboard" instead.`)) return;
    guarded(async () => {
      await db.deleteMember(delId);
      picked.delete(delId);
      flash("Member deleted.");
      await reloadAll();
    });
  }
});

$("#member-form").addEventListener("submit", (e) => {
  e.preventDefault();
  guarded(async () => {
    const m = {
      name: $("#m-name").value.trim(),
      major: $("#m-major").value.trim() || null,
      class_year: $("#m-year").value.trim() || null,
      active: $("#m-active").checked,
    };
    if ($("#m-id").value) m.id = $("#m-id").value;
    await db.saveMember(m);
    flash(m.id ? "Member updated." : `Added ${m.name}.`);
    resetMemberForm();
    await reloadAll();
  });
});

$("#bulk-form").addEventListener("submit", (e) => {
  e.preventDefault();
  guarded(async () => {
    const existing = new Set(members.map((m) => m.name.toLowerCase()));
    const lines = $("#bulk-names").value.split("\n").map((s) => s.trim()).filter(Boolean);
    const names = [...new Set(lines)].filter((n) => !existing.has(n.toLowerCase()));
    if (!names.length) throw new Error(lines.length ? "All of those names already exist." : "Enter at least one name.");
    await db.addMembers(names);
    flash(`Added ${names.length} member(s).${lines.length > names.length ? ` Skipped ${lines.length - names.length} duplicate(s).` : ""}`);
    $("#bulk-names").value = "";
    await reloadAll();
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function renderHistory() {
  const q = $("#history-search").value.trim().toLowerCase();
  $("#history-rows").innerHTML =
    history
      .filter((p) => !q || [p.members?.name, p.events?.title, p.reason].some((s) => s?.toLowerCase().includes(q)))
      .slice(0, 200)
      .map((p) => `
        <tr>
          <td class="muted" style="white-space:nowrap;">${esc(fmtDate(p.awarded_at, { month: "short", day: "numeric", year: "numeric" }))}</td>
          <td>${esc(p.members?.name || "—")}</td>
          <td>${esc(p.events?.title || p.reason || "—")}${p.events && p.reason ? `<div class="muted" style="font-size:.85rem;">${esc(p.reason)}</div>` : ""}</td>
          <td class="num"><strong>${p.points > 0 ? "+" : ""}${p.points}</strong></td>
          <td class="row-actions"><button class="btn btn-danger btn-sm" data-delete-entry="${p.id}">Undo</button></td>
        </tr>`)
      .join("") || `<tr><td colspan="5" class="muted">No points awarded yet.</td></tr>`;
}

$("#history-search").addEventListener("input", renderHistory);

$("#history-rows").addEventListener("click", (e) => {
  const id = e.target.dataset.deleteEntry;
  if (!id || !confirm("Remove this points entry?")) return;
  guarded(async () => {
    await db.deleteEntry(id);
    flash("Entry removed.");
    await reloadAll();
  });
});

boot();
