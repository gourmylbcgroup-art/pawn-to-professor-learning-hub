# Pawn to Professor v1.9.1 — Responsive Display

This is a **display-only patch**.

It does NOT change Supabase, users, trials, games, resources, email, security, analytics, legal consents, access groups, or payment/access permissions.

## What it does

One website now has three automatic layouts:

### Desktop / computer
- Existing large classroom layout stays intact
- Existing large post-login chalkboard stays intact
- 3-column menus remain available

### iPad / tablet
- Automatically detected, including iPad Pro landscape
- Large touch-friendly board
- 2-column menu/cards
- Larger text and touch buttons
- Unit objective / target language side-by-side
- Vocabulary full width
- Admin becomes a horizontal tab bar + full-width editor
- Registration and legal screens are easier to use
- Portrait and landscape both adapt automatically

### Mobile phone
- Automatically detected, including landscape
- Full-screen green Learning Hub workspace
- No miniature 720px desktop page
- No horizontal page scrolling
- Single-column menus, lessons, games, resources and curriculum information
- Registration becomes single-column
- 16px form fields to prevent iPhone Safari zoom
- Touch targets are enlarged
- Admin remains usable with horizontally scrollable Admin tabs
- Legal/Terms modal becomes a full-screen phone view
- Safe-area padding for phones with notches/home indicators

## Automatic selection

The new `responsive-layout.js` applies:

- `desktop`
- `tablet`
- `mobile`

iPhone / Android phones stay in Mobile layout even when rotated.

iPad / iPadOS stays in Tablet layout even on large iPad Pro landscape.

Regular computers keep Desktop layout.

The layout also refreshes automatically when the device rotates or the browser window changes size.

---

# INSTALLATION

This patch is designed to be installed **after v1.9.0**.

## GitHub

ADD:

- `responsive-layout.js`
- `responsive-display.css`

REPLACE:

- `index.html`

Do not replace or modify:

- `app.js`
- `portal-layout.js`
- `content-library.js`
- `member-trial.js`
- `legal.js`
- `analytics.js`
- any API file
- any Supabase SQL
- games
- resources
- security files

Suggested GitHub commit:

`v1.9.1 responsive desktop tablet mobile display`

## Vercel

Wait until the Production deployment shows:

`Ready`

Then hard refresh:

Mac:
`Command + Shift + R`

Windows:
`Ctrl + F5`

On iPhone/iPad Safari, close/reopen the tab or refresh the page.

---

# TEST CHECKLIST

## Computer
1. Open site on desktop/laptop.
2. Confirm the normal classroom display is unchanged.
3. Login.
4. Confirm the large post-login board is unchanged.

## iPad portrait
1. Open the site in Safari.
2. Confirm the board fills most of the iPad screen.
3. Confirm menus use 2 columns.
4. Open a Unit.
5. Confirm Objective + Target Language use 2 columns and Vocabulary is full width.
6. Open Admin and confirm Admin tabs run horizontally above the editor.

## iPad landscape
1. Rotate the iPad.
2. No reload should be necessary.
3. Confirm it stays in Tablet layout.
4. Confirm content expands naturally.

## Mobile portrait
1. Open on iPhone/Android.
2. Confirm there is NO sideways scrolling.
3. Confirm the Learning Hub becomes a full-screen green workspace.
4. Confirm cards are one column.
5. Confirm buttons are easy to tap.
6. Confirm registration and Terms are readable.

## Mobile landscape
1. Rotate the phone.
2. It should remain in Mobile layout rather than changing into Tablet.
3. Confirm content still scrolls vertically.

---

# DEBUG CHECK

If you ever want to see what the browser detected, open the browser console and run:

`PTPResponsive.current()`

Example:

`{ layout: "tablet", orientation: "portrait", ... }`

No database migration is required for v1.9.1.
