# LG submission checklist

## Technical package

- [x] LG webOS application version 1.0.0.
- [x] IPK generated and validated by CI.
- [x] `appinfo.json` declares 1920x1080 for the FHD Seller Lounge package.
- [x] Internal `icon.png` generated at 80x80.
- [x] Internal `largeIcon.png` generated at 130x130.
- [x] Separate Seller Lounge icon generated at 400x400 from the official brand system.
- [x] Production-hosted Smart TV bundle deployed.
- [x] Restricted LG review portal implemented.
- [x] LG review portal uses the same canonical SVG symbol/wordmark as the product.
- [x] Isolated QA account architecture implemented.
- [x] webOS-only activation restriction implemented.
- [x] Device limit and expiration implemented.
- [x] Demonstration cache separated from commercial playlists.
- [x] Diagnostics and activation audit enabled.

## Seller Lounge private review notes

- [ ] Paste the review portal URL.
- [ ] Paste the private review email and password.
- [ ] Attach/paste `UX_SCENARIO_EN.md`.
- [ ] Confirm review-account expiration is after the expected QA window.

## Store metadata

- [ ] Replace `[SELLER LEGAL NAME]`.
- [ ] Replace `[SUPPORT EMAIL]`.
- [ ] Use `https://conecta-five-iota.vercel.app/privacy.html` as the privacy-policy URL.
- [ ] Review country availability and content rating.
- [ ] Upload `lg-seller-lounge-icon-400.png` from the exact candidate workflow artifact.
- [ ] Upload final screenshots using the same current vector identity.

## Checklist integrity

- [ ] Download the current LG Self Checklist template.
- [ ] Do not mark physical-TV tests as passed unless observed.
- [ ] Keep the QA portal and demo media available until approval is complete.
- [ ] Do not revoke the review credentials during QA.
- [ ] Test the exact IPK hash recorded for the current RC; do not rebuild a supposedly equivalent package after physical approval.
