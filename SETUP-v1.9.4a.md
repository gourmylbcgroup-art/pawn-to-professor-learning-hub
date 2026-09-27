# Pawn to Professor v1.9.4a — Registration Scroll Fix

## Problem fixed

After Teacher/Learner registration, age selection, guardian fields and Terms/Privacy were added, the registration form became taller than the desktop chalkboard.

The desktop board has a fixed height and `overflow: hidden`, so the bottom of the registration form was clipped and the mouse wheel could not reach it.

## New behavior

### Computer / desktop
- Left `Request Access` title remains fixed.
- The registration card on the RIGHT becomes independently scrollable.
- Mouse wheel / trackpad scrolls through Terms, Privacy, trial message and buttons.
- A visible scrollbar appears on the right edge of the registration card.
- The final `Request Account` button remains reachable.

### iPad / tablet
- Existing full registration page scrolling is preserved.

### Mobile
- Existing full-screen registration page scrolling is preserved.

## Installation

NO SQL.

### GitHub

ADD:

`registration-scroll-fix.css`

REPLACE:

`index.html`

Do NOT replace:
- app.js
- member-trial.js
- legal.js
- responsive-display.css
- registration API
- any Supabase SQL

Suggested commit:

`v1.9.4a fix registration scrolling`

### Vercel

Wait for:

`Production → Ready`

Then hard-refresh:

Mac:
`Command + Shift + R`

Windows:
`Ctrl + F5`

### Test

Open:
`Create Account`

On computer:
1. Put the mouse over the RIGHT registration form.
2. Scroll down.
3. You should be able to reach all Terms & Privacy checkboxes.
4. Continue scrolling to the 7-day trial notice.
5. Reach `Back` and `Request Account`.

The classroom background and left-side Request Access branding should stay in place.
