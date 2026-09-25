# Pawn to Professor v1.7.0 — Curriculum + Topic Library

## What this update does

The Learning Hub now has two entrances after login:

1. `📚 Browse by Curriculum`
2. `🌍 Browse by Topic`

They point to the same underlying content. Games and interactive lessons are NOT duplicated.

## Browse by Curriculum

Current school flow remains familiar:

`2026 → Grade → Unit`

Each Unit becomes a simple teacher-facing page:

- Curriculum Objective
- Target Language
- Vocabulary
- Then ONLY the materials that actually exist

Material categories:

- 🧩 Interactive Lesson
- 🖥 Presentation
- 🃏 Flashcards
- 📝 Worksheet
- 🎮 Interactive Game
- 📁 Other Resources (only when necessary)

If a Unit has no worksheet, no Worksheet section is shown.

## Browse by Topic

The same Unit/package can also be found by a general EFL topic such as:

- Family & People
- Food & Drinks
- Weather & Seasons
- Travel & Transportation
- Countries & World
- etc.

This prepares the site for future teachers outside the current curriculum.

## Existing games are protected

This patch does NOT change:

- `activities` IDs
- activity target URLs
- secure launch URLs
- `play.html`
- `play.js`
- game code
- activity security gates
- device security

An activity whose Type is `Interactive Lesson` appears under:

`🧩 Interactive Lesson`

Other existing activities appear under:

`🎮 Interactive Game`

They still use the same secure launcher.

## iCloud resources

Presentation, Flashcards and Worksheets remain hosted on iCloud.

Admin → Resources now also contains the resource type:

`Presentation`

The website stores the metadata/private target as before and only shows buttons to members with Unit access.

## Curriculum data added automatically

The SQL populates the supplied Yunlin County Year 115 curriculum for:

- Grade 3 — Units 1–12
- Grade 4 — Units 1–9
- Grade 5 — Units 1–10
- Grade 6 — Units 1–10

It populates:

- Unit title
- Curriculum objective
- Target language
- Vocabulary
- Pawn to Professor topic/subtopic classification

The topic classification is an organizational layer for this website. It is separate from the official curriculum wording.

## Important

The SQL may create missing 2026 Grade 3–6 Units so the curriculum structure is complete.

It does NOT delete or replace existing activities or resource links attached to Units.

---

# INSTALLATION

## Step 1 — Supabase

Open:

Supabase → SQL Editor → New query

Run the COMPLETE file:

`supabase/v1.7.0-dual-library.sql`

Expected:

`Success. No rows returned`

The SQL is designed to be safe to run more than once.

## Step 2 — GitHub

ADD:

- `content-library.js`
- `content-library.css`
- `supabase/v1.7.0-dual-library.sql`

REPLACE:

- `index.html`

Do NOT replace:

- `app.js`
- `analytics.js`
- `analytics.css`
- `play.js`
- `play.html`
- `portal-layout.js`
- `portal-layout.css`
- `device-verify-fix.js`
- `login-compatibility.js`
- `password-recovery.js`
- `api/security.js`
- `api/game/*`
- `vercel.json`

Suggested commit:

`v1.7.0 curriculum and topic library`

## Step 3 — Vercel

Wait until Production shows:

`Ready`

Then hard refresh:

Mac:
`Command + Shift + R`

## Step 4 — Test

### Curriculum route

1. Login.
2. Click `Browse by Curriculum`.
3. Open `2026`.
4. Open `Grade 3`.
5. Open `Unit 3`.

Expected Unit page:

`Unit 3 — My Family, My Pet and Me`

with:

- Objective
- Target Language
- Vocabulary
- Only the resources/activities that really exist.

### Topic route

1. Return Home.
2. Open `Browse by Topic`.
3. Open `Family & People`.
4. Open `My Family, My Pet and Me`.

Expected:

The same Unit page and same secure resources.

### Existing game test

Open any existing Game or Interactive Lesson.

It should launch exactly as before through:

`/play.html?activity=...`

No game URL needs to be changed.

## Resource categories

Admin → Resources:

- Presentation → iCloud
- Flashcards → iCloud
- Worksheet → iCloud

Admin → Activities:

- Interactive Lesson → existing hosted interactive lesson link
- Game → existing hosted game link

## No new Vercel API function

v1.7.0 adds no new serverless API endpoint.
