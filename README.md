# Pawn to Professor Learning Portal

A deployment-ready HTML5 learning portal designed for **GitHub + Vercel + Supabase**.

The classroom image is the full-page scene. **Every website menu is rendered inside the green chalkboard**: login, years, grades, units, activities, and the admin panel.

## What Version 1 already does

- Username + password login.
- Supabase authentication.
- School structure: Year → Grade → Unit → Game/Activity.
- Seeded year: **2025**. Add 2026 or later years from the Admin panel.
- Seeded grades: **Grade 1, Grade 2, Grade 4, Grade 5, Grade 6**.
- Seeded Unit 1 and Unit 2 for each grade; admin can add more.
- Unit-level access control per user.
- Example: a user can have **Unit 1 in every grade** but no access to Unit 2.
- Admin can create users.
- Admin can activate/deactivate accounts and set expiry dates.
- Admin can grant all units, clear access, grant a whole grade, or grant Unit 1 across all grades.
- Admin can add years, grades, units, and game/activity links.
- Designed so existing game repositories stay separate.
- Ready for future paid subscriptions through the existing access/expiry model.

## Architecture

```text
GitHub repository
      │
      ▼
Vercel
  ├─ Static HTML5 / CSS / JavaScript website
  └─ Serverless API (admin user creation)
      │
      ▼
Supabase
  ├─ Authentication
  ├─ PostgreSQL database
  └─ Row Level Security
```

## 1. Create a Supabase project

Create a new Supabase project. Then open **SQL Editor**, paste everything from:

`supabase/schema.sql`

and run it once.

This creates all tables, access rules, helper functions, and the initial 2025 structure.

## 2. Create the first administrator

In Supabase:

1. Open **Authentication → Users**.
2. Create a user manually with:
   - Email: `admin@portal.local`
   - Password: choose a strong password.
3. Return to **SQL Editor** and run:

```sql
update public.profiles
set username = 'admin',
    display_name = 'Administrator',
    role = 'admin',
    status = 'active'
where id = (
  select id from auth.users where email = 'admin@portal.local'
);
```

You will log into the website with:

- Username: `admin`
- Password: the password you selected.

## 3. Put this project on GitHub

Create a new repository, for example:

`learning-portal`

Upload this entire folder to it. Do **not** merge it into your existing game repositories.

## 4. Import the GitHub repository into Vercel

Create a new Vercel project from the GitHub repository.

Add these three environment variables in **Vercel → Project Settings → Environment Variables**:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Find the URL and keys in your Supabase project settings/API keys area.

### Important security rule

`SUPABASE_SERVICE_ROLE_KEY` is a secret. It is used only by the Vercel server function. **Never put it in index.html, app.js, GitHub screenshots, or client-side code.**

The `SUPABASE_ANON_KEY` is designed to be used by the browser; access is protected by Row Level Security.

Redeploy Vercel after adding the variables.

## 5. How username login works

For simplicity, users see a normal **username/password** login.

Internally, an account such as:

`teacher01`

uses a private Supabase login alias:

`teacher01@portal.local`

The administrator creates these accounts from the Admin panel. Users never need to know the alias email.

## 6. Add your existing games

Deploy each existing game separately, just as you already do. In the new portal:

**Admin → Activities → choose Year → Grade → Unit → enter title → enter deployed URL → Publish Activity.**

For example:

```text
2025
  Grade 1
    Unit 1
      Numbers
      Where Are You?
```

The central portal becomes the menu; the game repositories remain independent.

## 7. Access example

For a customer who may use all grades but only Unit 1:

1. Admin → Users & Access.
2. Select the customer.
3. Click **Unit 1 · All Grades**.
4. Click **Save Access**.

The customer sees all grades, but Unit 2 and later units remain locked.

## 8. Payment-ready design

Version 1 intentionally keeps payment manual and simple.

When someone pays, you can:

- activate the account;
- select the purchased units;
- set an expiry date.

Later, Stripe or another payment service can call a Vercel API/webhook and update the same access tables automatically. The website does not need to be redesigned.

## Important limitation with public game URLs

If an individual game is deployed on a completely public URL, a customer could copy that direct URL and share it. The portal controls discovery and database access, but it cannot make a separate public GitHub/Vercel game private by itself.

For a stronger commercial Version 2, move protected games behind authenticated portal routes or serve game files through signed/private storage. Build Version 1 first; harden game delivery before charging at larger scale.

## Project files

```text
index.html                  Main HTML5 interface
styles.css                  Classroom/chalkboard visual layout
app.js                      Login, menus, admin panel and access logic
assets/classroom-bg.png     3D classroom background
api/config.js               Safely provides public Supabase config
api/admin/create-user.js    Server-only account creation
supabase/schema.sql         Database + RLS + seed structure
vercel.json                 Vercel configuration
.env.example                Environment variable names
```
