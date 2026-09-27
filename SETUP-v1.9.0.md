# Pawn to Professor v1.9.0 — Teacher/Learner Legal Terms

This patch **includes the v1.8 Teacher/Learner + 7-day Unit 1 trial migration** and adds the new legal system.

You can install v1.9.0 whether v1.8 is already installed or not. The SQL uses `IF NOT EXISTS` / replaceable functions and is designed to preserve existing users, games, resources, access groups and permissions.

## What v1.9.0 adds

### Registration
Teacher registration:
- Teacher account type
- 18+ confirmation
- Common Terms of Use
- Teacher Terms of Use
- Privacy Policy acknowledgement

Learner registration:
- Learner account type
- Adult / under-18 choice
- Common Terms of Use
- Learner Terms of Use
- Privacy Policy acknowledgement

Under-18 Learner:
- Parent/guardian name
- Parent/guardian email
- Parent/guardian permission
- Agreements are recorded as accepted by the guardian

The checkboxes are NEVER pre-checked.

### Legal audit trail
For every new registration the database records:
- exact legal document version
- document type
- Teacher/Learner account type
- user or guardian acceptance
- acceptance time
- guardian details when applicable

### Admin editor
Admin → **⚖️ Legal & Registration**

Four editable/versioned documents:
1. Common Terms of Use
2. Teacher Terms of Use
3. Learner Terms of Use
4. Privacy Policy

For each document you can:
- edit a new version
- preview it
- save it as Draft
- publish it
- decide whether existing affected members must accept it again

Published versions are immutable. To change published text, create a new version.

### Re-acceptance
When Admin publishes a material new version with:

`Require affected existing users to accept this version on next login`

affected normal users see a blocking legal screen at next login.

Teacher changes affect Teachers.
Learner changes affect Learners.
Common Terms / Privacy changes affect both.

Under-18 Learners require guardian confirmation again.

### Existing members
The seeded v1.0 agreements do **not** force your existing users to accept immediately.

New registrations must accept them.

If you later publish v1.1 with re-acceptance ON, affected existing members must accept v1.1.

---

# INSTALLATION

## 0. Recommended
Temporarily set:

Admin → Settings → Public Registration → OFF

## 1. Supabase
Open:

Supabase → SQL Editor → New Query

Run the COMPLETE file:

`supabase/v1.9.0-legal-terms.sql`

Expected:

`Success. No rows returned`

## 2. GitHub

ADD:
- `legal.js`
- `legal.css`
- `member-trial.js` if it does not already exist
- `member-trial.css` if it does not already exist
- `supabase/v1.9.0-legal-terms.sql`

REPLACE:
- `index.html`
- `member-trial.js` (if v1.8 is already installed)
- `api/register-request.js`

Do NOT replace:
- `app.js`
- `content-library.js`
- `analytics.js`
- `play.js`
- `play.html`
- device/security files
- `vercel.json`

Suggested commit:

`v1.9.0 editable teacher learner legal terms`

## 3. Vercel
Wait for Production to show:

`Ready`

Then hard refresh:

Mac: `Command + Shift + R`

## 4. Admin legal check
Login as Admin/Owner.

Open:

Admin → ⚖️ Legal & Registration

Confirm these show as Published v1.0:
- Common Terms
- Teacher Terms
- Learner Terms
- Privacy Policy

Review and edit the wording before opening registration broadly.

IMPORTANT: The included legal text is a practical draft template for this Learning Hub, not a substitute for professional legal review.

## 5. Teacher registration test
Turn Public Registration ON.

Create a test Teacher.

Expected:
- must choose Teacher
- must confirm 18+
- must agree to Common Terms
- must agree to Teacher Terms
- must acknowledge Privacy Policy
- cannot register without all three

Admin approves → 7-day Unit 1 trial starts.

## 6. Adult Learner test
Create a Learner → 18+.

Expected:
- Common Terms
- Learner Terms
- Privacy Policy

No Teacher Terms.

## 7. Minor Learner test
Create Learner → Under 18.

Expected:
- guardian name/email/permission required
- guardian wording appears on legal checkboxes
- consent records are stored as `accepted_by = guardian`

## 8. Re-acceptance test
Admin → Legal & Registration.

For Teacher Terms:
1. Change version to `1.1`
2. Edit a small line
3. Tick `Require affected existing users to accept this version on next login`
4. Publish

Log in as a normal Teacher.

Expected:
- blocking legal screen
- Teacher must accept v1.1
- Learner is NOT asked to accept Teacher Terms v1.1

For testing only, you can later publish another version with re-acceptance OFF.

---

# VERIFY DATABASE

Run:

```sql
select
  document_type,
  version,
  published,
  require_reacceptance
from public.legal_document_versions
order by document_type, created_at desc;
```

You should see one published version for each document type.

Check recorded consents:

```sql
select
  p.username,
  c.document_type,
  c.version,
  c.member_type_at_acceptance,
  c.accepted_by,
  c.accepted_at
from public.user_legal_consents c
join public.profiles p on p.id = c.user_id
order by c.accepted_at desc;
```

---

# IMPORTANT BEHAVIOR PRESERVED

- Admin/Owner security roles
- Teacher/Learner account type
- 7-day Unit 1 trial
- trial expiry
- direct paid access
- Access Groups
- games
- Interactive Lessons
- iCloud resources
- trusted-device verification
- content notification emails
- analytics
- community
- Browse by Curriculum
- Browse by Topic
- Teacher Tools remain staff-only
