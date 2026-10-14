# SASE at Wichita State — website

The chapter website. It has an events calendar, a points leaderboard, and an officer admin panel.

- **Plain HTML/CSS/JS.** There's no build step or framework, so any officer can edit it.
- **[Supabase](https://supabase.com)** (free tier) stores events, members, and points, and handles officer logins.
- **[Cloudflare Pages](https://pages.cloudflare.com)** (free) hosts the site. It can use a custom domain at no cost.

With no Supabase keys configured, the site runs in **demo mode** using sample data. That way you can preview it right away.

```
site/                  ← everything that gets deployed
  index.html           home: about, upcoming events, top members, officers, sponsors
  events.html          month calendar + event list (with "Add to Google Calendar")
  leaderboard.html     semester / all-time rankings
  admin.html           officer-only: award points, manage events & members, undo entries
  js/config.js         ← org settings + Supabase keys (edit this)
  js/data.js           all database calls (and demo data)
  css/style.css        theme colors at the top
  assets/              logos / photos go here
supabase/schema.sql    database tables + security rules
.github/workflows/     keeps the free Supabase project from pausing
```

## Preview locally

```bash
python3 -m http.server 8000 --directory site
```

Then open http://localhost:8000. To try the admin panel in demo mode, go to `/admin.html`. Any email works there.

## Go live (one-time setup, ~20 minutes)

### 1. Create the database (Supabase)

1. Sign up at supabase.com. Then create a new project (free plan) in the closest region, US Central or US East.
2. Go to **SQL Editor → New query**, paste in all of `supabase/schema.sql`, and click **Run**.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `site/js/config.js`.
   The anon key is safe to make public. The security rules only allow admins to make changes.

### 2. Create officer logins

1. Go to **Authentication → Users → Add user → Create new user**. Enter the officer's email and a password, and check *Auto Confirm User*.
2. Copy that user's **UID**. Then make them an admin in the **SQL Editor**:
   ```sql
   insert into public.admins (user_id, note) values ('PASTE-UID-HERE', 'Jane Doe – President');
   ```
3. Turn off public sign-ups so random people can't make accounts. Go to **Authentication → Sign In / Providers** and turn off *Allow new users to sign up*.
   (Non-admins couldn't edit anything anyway. This just keeps the user list clean.)

When an officer leaves, delete their user under **Authentication → Users**. Their admin row is removed automatically.

### 3. Host it (Cloudflare Pages)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
   - Framework preset: *None*
   - Build command: *(leave empty)*
   - Build output directory: `site`
3. Every push to `main` now redeploys automatically. You get a free `*.pages.dev` URL.

**Custom domain:** under the Pages project, go to **Custom domains → Set up a domain**. This is free on Cloudflare's side; you only pay for the domain itself.
- If the domain's DNS is on Cloudflare (free plan), it's one click.
- If not, add the CNAME record that Cloudflare shows you at your registrar.
- No domain yet? The [GitHub Student Developer Pack](https://education.github.com/pack) includes a free domain for a year from partner registrars. You can also ask WSU whether student orgs can get a subdomain.

**Alternatives:**
- GitHub Pages and Netlify are also free and support custom domains.
- If you'd rather self-host, any static file server works behind a Cloudflare Tunnel, for example `npx serve site` or nginx. Supabase stays the same.

### 4. Keep the database awake

Free Supabase projects pause after 7 days with no traffic. That's likely over summer and winter breaks.

The included GitHub Action prevents this by pinging the database every 3 days. To enable it, go to **Repo → Settings → Secrets and variables → Actions** and add two secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Day-to-day use (officers)

Log in at `/admin.html`. The link is also in the footer.

| Task | Where |
| --- | --- |
| Add an event to the calendar | **Events** tab → fill in the form → Save |
| Give attendance points | **Award points** → pick the event (points auto-fill) → check who came → Award |
| Give points for something else (committee work, etc.) | **Award points** → "No event" → enter points + reason |
| Fix a mistake | **Points history** → Undo |
| Add new members | **Members** → add one, or paste a list of names into Bulk add |
| Hide someone who left | **Members** → Edit → uncheck "Show on leaderboard" |
| New semester | Edit `currentSemester` in `site/js/config.js` (all-time totals are kept) |

A member can only get attendance points once per event, so double-clicking or re-submitting won't double-count.

**Everything in the database is publicly readable,** since that's how the leaderboard works. Only store names, majors, and class years. **Never store** emails, student IDs, or phone numbers. Let members know their name and points will be shown publicly.

## Replacing placeholders

The dashed boxes labelled LOGO, Photo, and Sponsor are placeholders. Search the HTML for `logo-placeholder` and `img-placeholder`.

1. Put image files in `site/assets/`.
2. Swap each placeholder `<div>` for an `<img>`, for example `<img src="assets/logo.png" alt="SASE WSU logo" class="logo-sm">`.

Other things to update:

- **Theme colors:** the top of `site/css/style.css`.
- **Social links, contact email, join link:** `site/js/config.js`.
- **Officer names:** the "Executive board" section in `site/index.html`.
- **Favicon:** `site/assets/favicon.svg`.
