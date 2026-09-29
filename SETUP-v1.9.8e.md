# Pawn to Professor v1.9.8e — Remove Duplicate Unit Heading

This is a global frontend-only patch for ALL grades and ALL units.

It removes the second repeated block:

CURRICULUM UNIT
Unit X — Title
Grade X · Unit X

The main heading at the top remains unchanged.

## Install

1. Upload `unit-heading-dedup.css` to the ROOT of the Learning Hub repository.
2. Open `index.html`.
3. Inside the `<head>` section, add this line AFTER `content-library.css`:

<link rel="stylesheet" href="unit-heading-dedup.css?v=1.9.8e">

4. Commit.
5. Wait for Vercel Production → Ready.
6. Hard refresh:
   Mac: Command + Shift + R
   Windows: Ctrl + F5

## No SQL required

This patch does NOT change:
- curriculum data
- objectives
- target language
- vocabulary
- games
- resources
- payments
- messages
- access
- secure launch
