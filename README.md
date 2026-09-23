# Highway Observatory

A top-down, interactive highway simulation built with HTML, TypeScript, Canvas 2D, and Vite. Start with a 120 km/h limit and a driver holding the left lane at 110 km/h. Watch traffic build up, then let that driver finish overtaking and return right.

**[Play the simulator online](https://firepol-ai.github.io/simulator-highway/)** — no installation needed.

## Run locally

Requires Node.js 22.18+ (or Node.js 24+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Experiment

- Switch to **Winding road** for a full-window 6 km circuit with alternating bends and a narrower road. Its **Controls** panel includes the same settings and arcade switches. The circuit uses five times as many vehicles by default to preserve density, with a range of 60–800. Each mode keeps its own state and pauses while you use the other. Switch back with **Back to straight road**; Escape closes the controls first, then returns to the straight view.
- Adjust the speed limit (60–300 km/h), right-lane slow drivers’ desired speed (40–300 km/h), faster drivers’ desired speed (60–300 km/h), vehicle count, and blocking driver’s speed (40–300 km/h). Driver speeds are independent of the speed limit; defaults are 135 km/h for faster drivers and 110 km/h for the blocker. Each change restarts the scene.
- Let traffic develop for 30–60 simulated seconds. Use 2× or 5× playback to speed up the experiment.
- Select **Clear the left lane**. The orange car accelerates, waits for a safe gap, and merges right. The nearby right-lane follower allows extra space for the signaled merge.
- The button then becomes **Occupy the left lane**. Select it to send the same driver back left through an available gap and resume its blocking speed, without resetting traffic or the chart. You can reverse either request while the driver is still waiting to change lanes.
- Compare average speed and the number of held-back vehicles. The chart marks the release time; recovery is gradual and depends on density and other slow vehicles.
- Pause, restart, or hide individual speed labels at any time.

## Model and limits

### Optional arcade behavior

The **A little less civilised** panel adds four independent switches, all off by default:

- **Random right-side passing:** some held-back left-lane drivers try the right lane when nearby traffic there is faster or nearly as fast (within 5 km/h). They use shorter following and merge gaps, then move back left only after fully clearing the car they were following. Available space and slower right-lane traffic affect whether a pass can succeed.
- **Horns & flashing lights:** frustrated drivers in the left lane honk and flash at the car ahead in that lane. Drivers cruising on the right are left alone. The light beams and horn rings work even with sound muted.
- **Crazy road rage:** after waiting behind the blocker, the following car may accelerate into it. The blocker skids off-road with sparks, smoke, and a wreck.
- **007 mode:** the car directly behind the blocker may fire a short machine-gun burst before the blocker crashes off-road. When both crash modes are enabled, one is randomly selected for the encounter.

Enable **Sound effects** for synthesized horns, gunfire, impact, and skid sounds. Audio starts only after opting in. Muting, pausing, resetting, or hiding the tab stops current sounds. No audio files or external sound services are used.

Behavior switches take effect without restarting. Disabling a crash mode cancels its pending attack; releasing the blocker also cancels an attack. Right-side passes already underway finish their lane maneuver, unless their target leaves the left lane. After a crash, **Spawn new blocker** inserts another driver into an available left-lane gap while keeping the wrecks, simulation time, and chart history. If there is no suitable gap, the spawn request stays pending while a left-lane driver slows to make room; the new blocker appears automatically. If paused, resume to let the gap open. Reset clears events, impatience, and all wrecks while preserving the selected switches. Random choices use a repeatable seed for comparisons. These are fictional arcade effects, not a model of crash or weapon physics. Wrecks are excluded from active traffic metrics, and crashes remain marked on the speed chart.

### Traffic model

Vehicles follow a simplified Intelligent Driver Model, with desired speeds, acceleration limits, closing-speed-dependent headways, and gap checks for lane changes. Faster drivers overtake left and return right. A virtual leader discourages passing slower left-lane traffic on the right. The blocking driver remains left until released.

The original road is a deterministic, repeating 1.2 km loop with a fixed number of vehicles. Cars are enlarged for readability; the visualization is schematic. In the original mode, narrow displays show a closer view that follows the blocker. Winding mode shows the entire 6 km circuit; its bends are a visual layout and do not impose cornering speed limits. Vehicle sizes are schematic and do not scale with simulated distance. This is an illustrative model, not a calibrated forecast or a complete implementation of traffic law. Desired speeds above the chosen limit represent driver behavior, not advice. The right-lane slow-driver control sets the trucks’ desired speed (108 km/h by default), independently of the general limit. Trucks can still be slowed by vehicles ahead. Cars more than 8 km/h below their desired speed count as held back. Flow is estimated as vehicle density multiplied by average speed; it is not detector-measured throughput.

## Validation

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

To use an existing Chromium installation, set `CHROMIUM_PATH` when running the browser tests, for example `CHROMIUM_PATH=/usr/bin/chromium-browser npm run test:e2e`.

For an isolated worktree, set `PLAYWRIGHT_PORT` to an unused port, for example `PLAYWRIGHT_PORT=5174 CHROMIUM_PATH=/usr/bin/chromium-browser npm run test:e2e`. Browser tests are scoped to `tests/`, so they do not discover nested worktrees. This project has no runtime environment files or database to copy.

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
