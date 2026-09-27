# Pawn to Professor v1.9.3 — Learner Topics + Controlled Community

**Do not install the older v1.9.2 patch.**

You told me you had NOT installed v1.9.2 yet, so v1.9.3 replaces/supersedes it.

Install v1.9.3 directly on top of your current v1.9.1 site.

---

## FINAL LEARNER EXPERIENCE

Learner home shows:

- 🌍 Browse by Topic
- 💬 Community (when Community is enabled)

Learners do NOT see:

- Browse by Curriculum
- Year → Grade → Unit tree
- Teacher Tools

### Browse by Topic rule

The Learner catalogue is built ONLY from Units that the learner can currently open.

During the 7-day trial, your existing access engine opens published **Unit 1** content.

Therefore:

**Trial Learner → sees only Topics that contain an accessible Unit 1 lesson.**

Example:

- Food & Drinks → Grade 5 Unit 1 → accessible → SHOW
- Weather → Grade 2 Unit 1 → accessible → SHOW
- Family & Pets → Grade 3 Unit 3 → locked → DO NOT SHOW
- Countries → Grade 6 Unit 8 → locked → DO NOT SHOW

### Zero-access Topic rule

If a Topic contains 5 teaching packages but the Learner can access 0:

**The Topic is hidden completely.**

The Learner does NOT see:

- a Topic with “0 lessons”
- locked lesson cards
- “No access” cards

If a Topic contains 8 total packages but the Learner can access only 1:

**The Learner sees: `1 lesson`**

After the trial expires, if the Learner has no paid or assigned Unit access, Browse by Topic shows a friendly “No learning topics are currently available” message.

When paid/assigned access is added later, relevant Topics automatically appear.

---

## LEARNER LESSON PAGE

Learners enter lessons only through Browse by Topic.

The learner-facing lesson removes:

- Curriculum Objective
- “Curriculum Unit” wording
- Year / Grade / Unit mapping
- Teacher Guide resources

The learner can still see useful learning content:

- Target Language
- Vocabulary
- Interactive Lesson
- Presentation (if permitted)
- Flashcards (if permitted)
- Worksheet (if permitted)
- Interactive Game
- other permitted learner resources

---

# COMMUNITY RULES

Learners CAN use the Community Forum.

Admin now controls visibility at TWO levels.

## 1. Category visibility

Admin → Community Management

Each Community category can be:

- **Everyone**
- **Teachers only**
- **Learners only**
- **Admin / Owner only**

Example:

- 📢 Announcements → Everyone
- 🎓 Learner Help → Learners only
- 👩‍🏫 Teacher Exchange → Teachers only
- 🔐 Staff Notes → Admin / Owner only

A Learner cannot see that a Teachers-only category exists.

## 2. Individual discussion visibility

Inside a visible Community category, Admin/Owner can set an individual discussion to:

- **Inherit category**
- **Everyone**
- **Teachers only**
- **Learners only**
- **Admin / Owner only**

Example:

General Help category = Everyone

Inside it:
- “How do I open my lesson?” → Everyone
- “Teacher classroom management discussion” → Teachers only

Learners see the first discussion and do not see the second.

## Database security

This is enforced by Supabase Row Level Security, not only by hiding buttons.

A Learner cannot fetch a hidden Teachers-only category, discussion or its replies simply by knowing the database ID.

Existing Community categories remain **Everyone** by default until you change them.

Existing discussions default to **Inherit category**.

---

# TEACHER / ADMIN BEHAVIOR

Teachers keep:

- Browse by Curriculum
- Browse by Topic
- Community

Admin/Owner keep all Admin functionality and can see every Community category/discussion.

Your existing rule that external Teacher Tools are staff-only remains unchanged.

---

# INSTALLATION

## STEP 1 — Run SQL

Supabase → SQL Editor → New Query

Copy and run:

`supabase/v1.9.3-learner-topics-community.sql`

Expected:

`Success. No rows returned`

## STEP 2 — GitHub

ADD:

- `learner-experience-v1.9.3.js`
- `community-audience.js`
- `supabase/v1.9.3-learner-topics-community.sql`

REPLACE:

- `index.html`

Do NOT install the old:

- `learner-topic-only.js`
- old v1.9.2 `index.html`

Do NOT replace:

- `app.js`
- `content-library.js`
- `member-trial.js`
- `legal.js`
- `responsive-layout.js`
- `responsive-display.css`
- API files
- older Supabase migrations

Suggested commit:

`v1.9.3 learner topics and community audience`

## STEP 3 — Vercel

Wait for Production:

`Ready`

Then hard refresh.

---

# TEST 1 — LEARNER DURING TRIAL

Use a newly approved Learner.

Expected home:

- Browse by Topic
- Community

No Curriculum.
No Teacher Tools.

Browse by Topic:

- only Topics containing currently accessible Unit 1 packages
- no Topic with count 0
- no locked lesson cards

---

# TEST 2 — LEARNER AFTER TRIAL

After trial expiry with no paid/assigned access:

Browse by Topic shows:

`No learning topics are currently available.`

Account remains active.

Community remains available according to Community visibility rules.

---

# TEST 3 — COMMUNITY

Admin → Community.

Set a category to:

`Teachers only`

Login as Learner.

Expected:

- category does not appear

Login as Teacher.

Expected:

- category appears

Then in an Everyone category, set one individual discussion to:

`Teachers only`

Learner:

- sees category
- does not see that discussion
- cannot read its replies

Teacher:

- sees the discussion

---

# DATABASE CHECK

Run:

```sql
select
  name,
  audience,
  enabled,
  staff_only_post
from public.forum_categories
order by sort_order, name;
```

And:

```sql
select
  title,
  audience,
  category_id,
  created_at
from public.forum_topics
where deleted_at is null
order by created_at desc;
```

---

# NO CHANGES TO

- 7-day trial engine
- paid/direct Unit permissions
- Access Groups
- games
- interactive lessons
- secure launch system
- iCloud resource security
- trusted-device security
- email notifications
- analytics
- Terms / Privacy
- responsive Desktop / iPad / Mobile layouts
