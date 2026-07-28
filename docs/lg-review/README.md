# LG App Review package

This folder contains the operational material for submitting RonecaPlayTV 1.0.0 to LG Content Store review.

## Review access

- Portal: `https://conecta-five-iota.vercel.app/lg-review.html`
- Credentials: stored outside the repository and supplied only in the private LG Seller Lounge review notes.
- Supported reviewer platform: LG webOS only.
- Access duration: temporary and controlled by `panel_review_accounts.expires_at`.
- Device limit: controlled by `panel_review_accounts.max_devices`.

## What the reviewer can do

1. Sign in to the isolated QA portal.
2. Enter the activation code displayed by the television.
3. Activate the LG webOS television automatically.
4. Open the isolated demonstration catalog.
5. Deactivate the television and repeat the activation test.

The account cannot access administration, resellers, customers, credits, finance, commercial playlists, playlist credentials, or customer playback data.

## Submission files

- `UX_SCENARIO_EN.md`: ready-to-paste English QA scenario.
- `UX_SCENARIO_PT.md`: Portuguese reference copy.
- `STORE_LISTING_EN.md`: proposed store copy.
- `SELF_CHECKLIST_GUIDE.md`: honest completion guide; no physical test result is invented.
- `CONTENT_AND_LICENSES.md`: demo-media sources and attribution.
- `PRIVACY_POLICY_DRAFT_EN.md`: privacy-policy draft with legal placeholders.
- `SUBMISSION_CHECKLIST.md`: final operational checklist.

## Remaining legal placeholders

Before submission, replace:

- `[SELLER LEGAL NAME]`
- `[SUPPORT EMAIL]`
- `[LEGAL ADDRESS, IF REQUIRED]`

These details must come from the Seller Lounge account owner and must not be invented in code.
