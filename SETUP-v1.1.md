# Pawn to Professor Learning Hub v1.1

## What this update adds

- **2026** with Grade 1, 2, 4, 5, 6 and Unit 1 + Unit 2.
- **Public Registration ON/OFF** controlled by Admin > Settings.
- New public registrations are always **PENDING**.
- **Registration Requests** page with Approve / Reject.
- Approved users get **no units automatically**; Admin chooses unit access.
- **Content Structure Manager**:
  - Add / rename / archive Year
  - Add / rename / archive Grade
  - Add / edit / hide Unit
- **Activity Manager**:
  - Add activity
  - Edit title / URL
  - Hide / show activity
- Admin-created users can store a real **contact email**.

This update does **not** add the forum, mass-email center, payment system or design editor yet. Those are safer as a later update after this user/registration foundation is tested.

---

# SAFE INSTALLATION ORDER

The order matters because the new website expects new database columns.

## Step 1 — Make a GitHub backup branch

Open your GitHub repository:

`gourmylbcgroup-art/pawn-to-professor-learning-hub`

At the top-left of the file list, click the branch selector that currently says **main**.

Create a new branch named:

`backup-before-v1.1`

Leave **main** as your working branch after the backup is created.

This gives you an easy copy of the currently working portal.

---

## Step 2 — Run the database upgrade FIRST

Open:

**Supabase > Pawn to Professor Learning Hub > SQL Editor > New query**

Open the file from this update package:

`supabase/v1.1-registration-content-manager.sql`

Copy the whole file into Supabase SQL Editor and press **RUN** once.

Expected result: no red error.

This SQL:

- keeps your existing administrator and users;
- does not delete existing activities or permissions;
- adds registration settings;
- adds pending/rejected account states;
- adds real contact email storage;
- adds archive fields for years/grades;
- creates 2026 and its initial grade/unit structure.

Do **not** run your original `schema.sql` again. Run only this v1.1 migration.

---

## Step 3 — Important Supabase security setting

Go to:

**Supabase > Authentication > Sign In / Providers > Email**

Find the option whose wording is similar to:

**Allow new users to sign up** / **Enable sign ups**

Turn direct public sign-up **OFF**.

Keep Email sign-in enabled.

Why: public registration should go through the Learning Hub's secure Vercel endpoint, where your Admin ON/OFF switch is enforced. Admin-created users and portal registration requests will still work because those are created by the server using the Supabase service key.

Do not turn off Email authentication itself.

---

## Step 4 — Replace the website files in GitHub

On the **main** branch, replace these existing files with the v1.1 versions:

- `index.html`
- `app.js`
- `styles.css`
- `package.json`
- `api/admin/create-user.js`

Add these new files:

- `api/register-request.js`
- `supabase/v1.1-registration-content-manager.sql`

The following can remain unchanged, but the package includes copies for completeness:

- `api/config.js`
- `vercel.json`
- `assets/classroom-bg.png`

### Easiest GitHub web method

For each file:

1. Open the file in GitHub.
2. Click the pencil **Edit** button.
3. Replace the contents with the matching file from this v1.1 package.
4. Commit directly to **main**.

For the two new files, use:

**Add file > Create new file**

and use the exact paths shown above.

If GitHub lets you upload the extracted folder contents and replace existing files in one commit, that is also fine. Make sure the files stay at the repository root; do not create an extra nested `pawn-to-professor-learning-hub-v1.1` folder inside the repository.

---

## Step 5 — Let Vercel deploy

Your GitHub repository is already connected to Vercel.

After the commit to **main**, Vercel should automatically create a new deployment.

Open:

**Vercel > pawn-to-professor-learning-hub > Deployments**

Wait for the newest `main` deployment to show **Ready**.

If no deployment starts, create one from branch:

`main`

You do **not** need new environment variables. Keep the existing three:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 6 — Test your existing Admin login

Open your live Learning Hub.

Log in with the administrator account that currently works.

Your current Admin should remain active after the migration.

Open **Admin**.

You should now see:

- 👥 Requests
- 👤 Users & Access
- 🎮 Activities
- 📚 Content Structure
- ⚙️ Settings

---

## Step 7 — Check 2026

Exit Admin back to the main menu.

You should now see:

- 2025
- 2026

2026 is pre-created with:

- Grade 1
- Grade 2
- Grade 4
- Grade 5
- Grade 6

Each starts with Unit 1 and Unit 2.

You can rename, archive, or add more items in **Admin > Content Structure**.

---

## Step 8 — Test adding a new Unit

Go to:

**Admin > Content Structure**

In the Unit form select:

- Year: `2026`
- Grade: `Grade 1`
- Unit name: `Unit 3`
- Unit title: for example `At School`

Press **+ Unit**.

You should see the new unit immediately in the structure tree.

The Unit receives **no normal-user access automatically**.

---

## Step 9 — Test the Registration switch

Go to:

**Admin > Settings**

You will see:

**Public Registration**

It is **OFF by default**.

### When OFF

The login screen does not show **Create Account**.

### When ON

Switch it ON and log out.

The login board should now show:

**Create Account**

No GitHub or Vercel redeploy is required when changing this setting. It is stored in Supabase.

---

## Step 10 — Test one public registration

Use an Incognito / Private browser window so you do not disturb your Admin session.

Open the Learning Hub and press **Create Account**.

Enter a test account, for example:

- Username: `testteacher2`
- Full name: `Test Teacher`
- Real email: an email address you control
- Password: at least 8 characters

Press **Request Account**.

The visitor should see:

**Registration received. Your account is waiting for administrator approval.**

Trying to log in before approval should show:

**Your registration is waiting for administrator approval.**

---

## Step 11 — Approve the registration

Return to your normal Admin browser.

Go to:

**Admin > Requests**

You should see the new pending user.

Press **Approve**.

Approval only activates the account. It intentionally does **not** grant Units.

Then go to:

**Admin > Users & Access**

Select the approved user and tick exactly the Units they may open.

For example:

- 2025 Grade 1 Unit 1 ✅
- 2025 Grade 1 Unit 2 ❌
- 2026 Grade 1 Unit 1 ✅

Press **Save Access**.

---

## Step 12 — Turn Registration OFF again if desired

Go to:

**Admin > Settings > Public Registration**

Switch OFF.

The **Create Account** button disappears from the public login board.

Existing approved accounts continue to work normally.

---

# Day-to-day Admin workflow

## Add a school year

Admin > Content Structure > New Year > `2027` > **+ Year**

## Add a grade

Choose Year > enter `Grade 3` > **+ Grade**

## Add a unit

Choose Year + Grade > enter `Unit 3` + optional title > **+ Unit**

## Rename / archive

Use the buttons in the **Current structure** tree.

Archive keeps the database data but removes that Year/Grade from the normal portal.

## Add a game or activity

Admin > Activities

Choose Year > Grade > Unit, then add:

- Type
- Title
- Launch URL

Press **+ Publish Activity**.

Existing activities can be edited or hidden from the same screen.

## Control user access

Admin > Users & Access > select user > tick Units > **Save Access**.

---

# If something goes wrong

Do not delete the Supabase project.

Your safety copy is the GitHub branch:

`backup-before-v1.1`

If the new deployment fails, the previous Vercel deployment is also still available in Vercel > Deployments.

The v1.1 SQL migration is additive: it does not delete your existing grades, units, activities or permissions.
