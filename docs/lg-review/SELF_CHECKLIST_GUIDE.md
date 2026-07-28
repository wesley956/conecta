# LG Self Checklist completion guide

Use the current official checklist downloaded from Seller Lounge. Do not claim a result that was not observed.

## Safe statements supported by automated validation

- The IPK was generated and structurally validated by CI.
- The application uses HTTPS for panel, activation, catalog-cache, and update requests.
- Review credentials are not embedded in the IPK.
- The review portal is isolated from administration, reseller, customer, financial, and commercial-playlist data.
- The application implements directional navigation, OK/Enter handling, Back handling, visible focus, and a webOS-specific platform adapter.
- The demonstration catalog contains a live HLS item, two movies, and a two-episode series.

## Items that require physical-TV or LG QA observation

Mark these only after a real result exists:

- Application launch on a physical LG television.
- Magic Remote pointer behavior.
- All directional-key focus paths.
- Long playback stability.
- Model/year-specific codec behavior.
- Audio-track selection on the target webOS version.
- Subtitle rendering on the target webOS version.
- Resume after television standby.

## Recommended honest wording when no local physical test was performed

`The submitted package passed automated build, package-structure, TypeScript, and integration validation. Physical model-specific behavior is provided for LG QA validation through the enclosed UX Scenario and isolated review account.`

This wording does not replace mandatory checklist fields; it explains the scope of the evidence without inventing a pass result.
