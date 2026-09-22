# Highway Observatory

A top-down, interactive highway simulation built with HTML, TypeScript, Canvas 2D, and Vite. Start with an 120 km/h limit and a driver holding the left lane at 110 km/h. Watch traffic build up, then let that driver finish overtaking and return right.

**[Play the simulator online](https://firepol-ai.github.io/simulator-highway/)** — no installation needed.

## Run locally

Requires Node.js 22.18+ (or Node.js 24+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Experiment

- Adjust the speed limit, faster drivers’ desired speed (60–300 km/h), vehicle count, and blocking driver’s speed (40–300 km/h). Driver speeds are independent of the speed limit; defaults are 135 km/h for faster drivers and 110 km/h for the blocker. Each change restarts the scene.
- Let traffic develop for 30–60 simulated seconds. Use 2× or 5× playback to speed up the experiment.
- Select **Clear the left lane**. The orange car accelerates, waits for a safe gap, and merges right. The nearby right-lane follower allows extra space for the signaled merge.
- Compare average speed and the number of held-back vehicles. The chart marks the release time; recovery is gradual and depends on density and other slow vehicles.
- Pause, restart, or hide individual speed labels at any time.

## Model and limits

Vehicles follow a simplified Intelligent Driver Model, with desired speeds, acceleration limits, closing-speed-dependent headways, and gap checks for lane changes. Faster drivers overtake left and return right. A virtual leader discourages passing slower left-lane traffic on the right. The blocking driver remains left until released.

The road is a deterministic, repeating 1.2 km loop with a fixed number of vehicles. Cars are enlarged for readability; the visualization is schematic. Narrow displays show a closer view that follows the blocker. This is an illustrative model, not a calibrated forecast or a complete implementation of traffic law. Desired speeds above the chosen limit represent driver behavior, not advice. Trucks target 12 km/h below the selected limit. Cars more than 8 km/h below their desired speed count as held back. Flow is estimated as vehicle density multiplied by average speed; it is not detector-measured throughput.

## Validation

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

To use an existing Chromium installation, set `CHROMIUM_PATH` when running the browser tests, for example `CHROMIUM_PATH=/usr/bin/chromium-browser npm run test:e2e`.

The build produces a static site in `dist/`. `npm run preview` serves it locally. Fonts load from Google Fonts with local sans-serif fallbacks. No backend or API keys are needed.

## Publish with GitHub Pages

The repository includes a [GitHub Actions deployment workflow](.github/workflows/deploy.yml). It tests and builds the app, then publishes `dist/` to GitHub Pages whenever `master` is pushed. Relative asset URLs allow the site to run under `/simulator-highway/`.

For the initial setup:

1. Create the public GitHub repository `firepol-ai/simulator-highway` without adding an initial README or other files.
2. Connect this checkout and push it:

   ```sh
   git remote add origin git@github.com:firepol-ai/simulator-highway.git
   git push -u origin master
   ```

3. Open the repository’s **Settings → Pages** and choose **GitHub Actions** as the build and deployment source.
4. Open **Actions → Deploy to GitHub Pages → Run workflow**, choose `master`, and run it. A successful deployment publishes [the playable website](https://firepol-ai.github.io/simulator-highway/).

After setup, commit your changes and run `git push origin master` to update the live website. You can check progress in the repository’s **Actions** tab. See the [Vite deployment guide](https://vite.dev/guide/static-deploy#github-pages) for the hosting setup.
