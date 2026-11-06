// Site configuration — the only file most officers will ever need to edit.
//
// Leave supabaseUrl / supabaseAnonKey empty to run in DEMO MODE with sample data.
// Both values come from Supabase → Project Settings → API. The anon key is meant
// to be public; Row Level Security (supabase/schema.sql) keeps writes admin-only.

export const config = {
  supabaseUrl: "https://rsanufwiyoicrgpkzrje.supabase.co",
  supabaseAnonKey: "sb_publishable_NXq2GcTvpUZioskF0oMRlw_PzeRsYK9",

  orgName: "SASE",
  orgFullName: "Society of Asian Scientists and Engineers",
  school: "Wichita State University",

  // The leaderboard's "This semester" view counts points awarded on or after this date.
  currentSemester: { name: "Fall 2026", start: "2026-08-17" },

  contactEmail: "wichita@saseconnect.org",
  links: {
    instagram: "https://www.instagram.com/wsu_sase/",
    discord: "https://discord.gg/VwQhFkzWNH",
    linkedin: "https://www.linkedin.com/company/sase-wsu/",
    join: "https://wichita.campuslabs.com/engage/organization/societyofasianscientistsandengineers",
  },
};
