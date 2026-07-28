# RonecaPlayTV — LG QA UX Scenario

## Preconditions

- Install the submitted RonecaPlayTV IPK on an LG webOS television.
- Keep the television connected to the internet.
- Use the private review-portal credentials provided in the confidential review notes.

## Activation

1. Launch **RonecaPlayTV** on the LG television.
2. Wait for the activation screen and keep the application open.
3. Note the activation code displayed on the television.
4. On a computer or mobile device, open:
   `https://conecta-five-iota.vercel.app/lg-review.html`
5. Sign in using the private LG review credentials supplied in Seller Lounge.
6. Enter the activation code exactly as displayed on the television.
7. Select **Activate LG TV**.
8. Return to the television. The application polls the activation service and loads the isolated QA catalog automatically.

## Functional review

### Home and navigation

1. Navigate through the side menu with the directional keys.
2. Confirm that the focused item is visibly highlighted.
3. Open Home, Channels, Movies, Series, Search, Favorites, History, and Settings.
4. Use the Back key to return to the previous screen.

### Live playback

1. Open **Channels**.
2. Select **HLS Demonstration Channel**.
3. Confirm that playback starts.
4. Test Play/Pause and Back.

### Movie playback

1. Open **Movies**.
2. Select **Big Buck Bunny** or **Sintel**.
3. Start playback.
4. Test Play/Pause, seeking, the progress bar, Back, and Continue Watching.
5. Add and remove a movie from Favorites.

### Series playback

1. Open **Series**.
2. Select **RonecaPlayTV Review Series**.
3. Open Season 1 and play Episode 1.
4. Test episode navigation and automatic next-episode behavior.

### Search and local features

1. Search for `Sintel`.
2. Open the result and start playback.
3. Verify Favorites and Continue Watching after returning to Home.

### Review reset

To repeat the activation flow, return to the web review portal and select **Deactivate for retest** beside the television. The TV returns to pending activation without exposing any commercial account.

## Notes

- The QA account is limited to LG webOS televisions.
- The catalog contains only an Apple developer HLS test stream and Blender Foundation open movies with attribution.
- No customer or reseller playlist is available to the reviewer.
