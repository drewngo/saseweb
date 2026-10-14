// Data layer. Talks to Supabase, or to in-memory sample data when no keys are configured.
import { config } from "./config.js";

const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm";

export const isDemo = !config.supabaseUrl || !config.supabaseAnonKey;

let clientPromise = null;
function sb() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_CDN).then(({ createClient }) =>
      createClient(config.supabaseUrl, config.supabaseAnonKey)
    );
  }
  return clientPromise;
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Demo data (used only when Supabase isn't configured)
// ---------------------------------------------------------------------------

const demo = (() => {
  const day = 864e5;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const at = (offsetDays, hour, min = 0) => {
    const d = new Date(today.getTime() + offsetDays * day);
    d.setHours(hour, min);
    return d.toISOString();
  };
  const id = () => crypto.randomUUID();

  const names = [
    ["Alex Nguyen", "Computer Science", "Junior"],
    ["Priya Patel", "Mechanical Engineering", "Senior"],
    ["Kevin Tran", "Aerospace Engineering", "Sophomore"],
    ["Mei Lin", "Biomedical Engineering", "Junior"],
    ["Daniel Kim", "Electrical Engineering", "Freshman"],
    ["Sofia Reyes", "Industrial Engineering", "Senior"],
    ["Ethan Park", "Computer Engineering", "Sophomore"],
    ["Hannah Le", "Chemistry", "Junior"],
    ["Ryan Chen", "Aerospace Engineering", "Freshman"],
    ["Aisha Rahman", "Mathematics", "Sophomore"],
    ["Jason Vo", "Mechanical Engineering", "Junior"],
    ["Grace Wong", "Biology", "Freshman"],
    ["Marcus Lee", "Computer Science", "Senior"],
    ["Linh Pham", "Electrical Engineering", "Sophomore"],
  ];
  const members = names.map(([name, major, class_year]) => ({
    id: id(), name, major, class_year, active: true, created_at: new Date().toISOString(),
  }));

  const ev = (title, offset, hour, dur, points, category, location, description) => ({
    id: id(), title, category, location, description, points,
    starts_at: at(offset, hour), ends_at: at(offset, hour + dur), created_at: new Date().toISOString(),
  });
  const events = [
    ev("General Body Meeting #1", -28, 18, 1, 10, "general", "RSC 233", "Kickoff meeting — meet the board and learn what SASE is about."),
    ev("Resume Workshop", -21, 17, 2, 15, "professional", "Engineering Building 101", "Bring your resume for peer and industry review."),
    ev("Boba Social", -14, 19, 2, 5, "social", "Campus Lawn", "Hang out, meet members, free boba."),
    ev("Industry Panel: Aerospace", -7, 18, 2, 20, "professional", "Beggs Hall", "Engineers from local aerospace companies talk careers."),
    ev("Food Bank Volunteering", -2, 9, 3, 25, "service", "Kansas Food Bank", "Carpool from campus at 8:30am."),
    ev("General Body Meeting #2", 3, 18, 1, 10, "general", "RSC 233", "Updates on regional conference and fall events."),
    ev("Mock Interviews", 9, 17, 2, 15, "professional", "Career Center", "Practice technical and behavioral interviews."),
    ev("Mid-Autumn Festival Night", 16, 18, 3, 15, "cultural", "RSC Ballroom", "Mooncakes, lanterns, and games."),
    ev("SASE Midwest Regional Conference", 30, 8, 9, 50, "professional", "TBD", "Travel details to come."),
  ];

  const entries = [];
  events.filter((e) => new Date(e.starts_at) < new Date()).forEach((e, j) => {
    members.forEach((m, i) => {
      if ((i * 7 + j * 3) % 5 < 3) {
        entries.push({ id: id(), member_id: m.id, event_id: e.id, points: e.points, reason: null, awarded_at: e.ends_at });
      }
    });
  });
  entries.push({ id: id(), member_id: members[1].id, event_id: null, points: 30, reason: "Committee chair", awarded_at: at(-5, 12) });
  entries.push({ id: id(), member_id: members[6].id, event_id: null, points: 10, reason: "Designed event flyer", awarded_at: at(-40, 12) });

  return { members, events, entries, session: null };
})();

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function listEvents({ from, to } = {}) {
  if (isDemo) {
    return demo.events
      .filter((e) => (!from || new Date(e.starts_at) >= from) && (!to || new Date(e.starts_at) < to))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  let q = (await sb()).from("events").select("*").order("starts_at");
  if (from) q = q.gte("starts_at", from.toISOString());
  if (to) q = q.lt("starts_at", to.toISOString());
  return unwrap(await q);
}

export async function upcomingEvents(limit = 3) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (isDemo) return (await listEvents({ from: now })).slice(0, limit);
  return unwrap(
    await (await sb()).from("events").select("*").gte("starts_at", now.toISOString()).order("starts_at").limit(limit)
  );
}

export async function leaderboard(since = null) {
  if (isDemo) {
    const totals = demo.members
      .filter((m) => m.active)
      .map((m) => ({
        member_id: m.id, name: m.name, major: m.major, class_year: m.class_year,
        total_points: demo.entries
          .filter((p) => p.member_id === m.id && (!since || new Date(p.awarded_at) >= since))
          .reduce((s, p) => s + p.points, 0),
      }))
      .sort((a, b) => b.total_points - a.total_points || a.name.localeCompare(b.name));
    totals.forEach((r, i) => {
      r.rank = i > 0 && r.total_points === totals[i - 1].total_points ? totals[i - 1].rank : i + 1;
    });
    return totals;
  }
  return unwrap(await (await sb()).rpc("leaderboard", { since: since ? since.toISOString() : null }));
}

export async function listMembers() {
  if (isDemo) return [...demo.members].sort((a, b) => a.name.localeCompare(b.name));
  return unwrap(await (await sb()).from("members").select("*").order("name"));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function getSession() {
  if (isDemo) return demo.session;
  return (await (await sb()).auth.getSession()).data.session;
}

export async function signIn(email, password) {
  if (isDemo) {
    demo.session = { user: { email: email || "demo@example.edu" } };
    return demo.session;
  }
  return unwrap(await (await sb()).auth.signInWithPassword({ email, password })).session;
}

export async function signOut() {
  if (isDemo) {
    demo.session = null;
    return;
  }
  await (await sb()).auth.signOut();
}

export async function isAdmin() {
  if (isDemo) return !!demo.session;
  return unwrap(await (await sb()).rpc("is_admin"));
}

// ---------------------------------------------------------------------------
// Admin writes (RLS rejects these for non-admins)
// ---------------------------------------------------------------------------

export async function saveEvent(event) {
  if (isDemo) return upsertDemo(demo.events, event);
  const { id, ...fields } = event;
  const q = (await sb()).from("events");
  return unwrap(await (id ? q.update(fields).eq("id", id) : q.insert(fields)).select().single());
}

export async function deleteEvent(id) {
  if (isDemo) {
    demo.events = demo.events.filter((e) => e.id !== id);
    demo.entries.forEach((p) => { if (p.event_id === id) p.event_id = null; });
    return;
  }
  unwrap(await (await sb()).from("events").delete().eq("id", id));
}

export async function saveMember(member) {
  if (isDemo) return upsertDemo(demo.members, { active: true, ...member });
  const { id, ...fields } = member;
  const q = (await sb()).from("members");
  return unwrap(await (id ? q.update(fields).eq("id", id) : q.insert(fields)).select().single());
}

export async function addMembers(names) {
  const rows = names.map((name) => ({ name }));
  if (isDemo) return rows.map((r) => upsertDemo(demo.members, { active: true, ...r }));
  return unwrap(await (await sb()).from("members").insert(rows).select());
}

export async function deleteMember(id) {
  if (isDemo) {
    demo.members = demo.members.filter((m) => m.id !== id);
    demo.entries = demo.entries.filter((p) => p.member_id !== id);
    return;
  }
  unwrap(await (await sb()).from("members").delete().eq("id", id));
}

// entries: [{ member_id, event_id?, points, reason? }]
// Members already credited for the same event are skipped. Returns the number inserted.
export async function awardPoints(entries) {
  if (isDemo) {
    let n = 0;
    for (const e of entries) {
      if (e.event_id && demo.entries.some((p) => p.member_id === e.member_id && p.event_id === e.event_id)) continue;
      demo.entries.push({ id: crypto.randomUUID(), awarded_at: new Date().toISOString(), event_id: null, reason: null, ...e });
      n++;
    }
    return n;
  }
  const rows = unwrap(
    await (await sb())
      .from("point_entries")
      .upsert(entries, { onConflict: "member_id,event_id", ignoreDuplicates: true })
      .select("id")
  );
  return rows.length;
}

export async function recentEntries(limit = 100) {
  if (isDemo) {
    return [...demo.entries]
      .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at))
      .slice(0, limit)
      .map((p) => ({
        ...p,
        members: { name: demo.members.find((m) => m.id === p.member_id)?.name },
        events: p.event_id ? { title: demo.events.find((e) => e.id === p.event_id)?.title } : null,
      }));
  }
  return unwrap(
    await (await sb())
      .from("point_entries")
      .select("id, points, reason, awarded_at, event_id, member_id, members(name), events(title)")
      .order("awarded_at", { ascending: false })
      .limit(limit)
  );
}

export async function deleteEntry(id) {
  if (isDemo) {
    demo.entries = demo.entries.filter((p) => p.id !== id);
    return;
  }
  unwrap(await (await sb()).from("point_entries").delete().eq("id", id));
}

function upsertDemo(list, item) {
  if (item.id) {
    const existing = list.find((x) => x.id === item.id);
    Object.assign(existing, item);
    return existing;
  }
  const created = { ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  list.push(created);
  return created;
}
