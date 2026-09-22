import "./style.css";
import { Simulation, type Settings } from "./simulation.ts";
import { RoadRenderer, drawChart } from "./renderer.ts";

const icons = {
  road: '<path d="M7 3 5 21M17 3l2 18M12 3v4m0 3v4m0 3v4"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  sliders:
    '<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name: keyof typeof icons, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Highway Observatory home"><span class="brand-mark">${icon("road", 25)}</span><span>highway<span class="brand-light"> observatory</span></span></a>
    <button class="text-button about-trigger">${icon("info", 15)} About the simulation</button>
  </header>
  <main>
    <section class="intro">
      <div><div class="eyebrow"><span class="tiny-cross">+</span> A SMALL EXPERIMENT IN TRAFFIC</div><h1>One driver. <span>A ripple effect.</span></h1><p>Watch a queue form. Clear the left lane. See the road breathe again.</p></div>
      <div class="location"><span class="swiss-flag">+</span><div>Swiss highway rules<small>Keep right. Overtake left.</small></div></div>
    </section>
    <div class="workspace">
      <aside class="settings panel">
        <div class="section-title"><h2>${icon("sliders", 17)} Set the scene</h2><span class="small-label">01</span></div>
        <p class="section-description">Small changes. Different traffic.</p>
        <div class="setting">
          <label for="speed-limit">Speed limit <span class="limit-sign" id="speed-sign">80</span></label>
          <div class="range-value"><output id="speed-limit-value" for="speed-limit">80</output><span>km/h</span></div>
          <input id="speed-limit" type="range" min="60" max="120" step="10" value="80" />
          <div class="range-ends"><span>60 km/h</span><span>120 km/h</span></div>
        </div>
        <div class="setting">
          <label for="faster-speed">Faster drivers <span class="setting-dot green"></span></label>
          <div class="range-value"><output id="faster-speed-value" for="faster-speed">95</output><span>km/h target speed</span></div>
          <input id="faster-speed" type="range" min="60" max="300" step="5" value="95" />
          <div class="range-ends"><span>60 km/h</span><span>300 km/h</span></div>
        </div>
        <div class="setting">
          <label for="vehicle-count">Traffic density <output class="value-pill" id="density-name">Moderate</output></label>
          <div class="range-value"><output id="vehicle-count-value" for="vehicle-count">26</output><span>vehicles on the road</span></div>
          <input id="vehicle-count" type="range" min="12" max="44" step="2" value="26" />
          <div class="range-ends"><span>Light</span><span>Heavy</span></div>
        </div>
        <div class="blocker-setting">
          <div class="blocker-title"><span class="setting-dot amber"></span><h3>The left-lane blocker</h3></div>
          <p>One driver stays in the overtaking lane. Faster cars behind have to adapt.</p>
          <label for="blocker-speed">Driver’s speed</label>
          <div class="range-value"><output id="blocker-speed-value" for="blocker-speed">75</output><span>km/h</span><span class="below-limit" id="below-limit">5 below limit</span></div>
          <input id="blocker-speed" class="amber-range" type="range" min="40" max="300" step="1" value="75" />
          <div class="range-ends"><span>40 km/h</span><span>300 km/h</span></div>
        </div>
        <p class="settings-note">Changing a setting restarts the experiment.</p>
      </aside>
      <div class="main-column">
        <section class="simulation-panel panel" aria-label="Highway simulation">
          <div class="simulation-toolbar"><div class="live-label"><span></span> LIVE SIMULATION <span class="divider">/</span><span class="road-name">Two lanes, one direction</span></div><div class="timer">${icon("road", 14)}<span id="clock">00:00</span></div></div>
          <div class="road-container"><canvas id="road" aria-label="Top-down animated highway: cars travel to the right, with the overtaking lane above the cruising lane. The blocking driver is orange." role="img"></canvas><div class="road-badge"><span class="badge-dot"></span> <span id="road-status">Left lane blocked</span></div><div class="road-scale">TOP VIEW <span>↗</span> 1.2 KM LOOP</div></div>
          <div class="playback-toolbar"><div class="playback-left"><button id="play-pause" class="icon-button" aria-label="Pause simulation">${icon("pause")}</button><button id="reset" class="icon-button" aria-label="Restart simulation">${icon("reset", 16)}</button><span class="toolbar-divider"></span><div class="playback-speeds" role="group" aria-label="Playback speed"><button data-speed="1" class="selected" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="5" aria-pressed="false">5×</button></div></div><label class="toggle-label"><input type="checkbox" id="show-speeds" checked /><span class="toggle"></span>Show speeds</label></div>
        </section>
        <section class="intervention" aria-label="Clear the blocking driver"><div class="intervention-icon">${icon("road", 24)}</div><div class="intervention-copy"><h2 id="action-title">Give traffic a little room.</h2><p id="action-description">Let the orange car finish overtaking and move back to the right.</p></div><button id="release" class="primary-button">Clear the left lane ${icon("arrow")}</button></section>
        <section class="metrics" aria-label="Live traffic statistics">
          <div class="metric panel"><div class="metric-label">Average speed <span>↗</span></div><div class="metric-number"><span id="average-speed">0</span><span>km/h</span></div><div class="metric-caption">All vehicles, both lanes</div></div>
          <div class="metric panel"><div class="metric-label">Vehicles held back <span class="amber-text">≋</span></div><div class="metric-number"><span id="queue-count">0</span><span>vehicles</span></div><div class="metric-caption">8+ km/h below desired speed</div></div>
          <div class="metric panel"><div class="metric-label">Traffic flow <span>⇢</span></div><div class="metric-number"><span id="traffic-flow">0</span><span>veh/h</span></div><div class="metric-caption">Estimate: density × average speed</div></div>
        </section>
        <section class="chart-panel panel"><div class="chart-header"><h2>Every slowdown tells a story.</h2><div class="chart-legend"><span><i></i>Average speed</span><span><i class="dashed"></i>Speed limit</span></div></div><canvas id="speed-chart" role="img" aria-label="Average traffic speed over the last two simulated minutes. A vertical marker shows when the blocker was released."></canvas><div class="chart-footer"><span>SPEED (KM/H)</span><span>SIMULATED TIME →</span></div></section>
      </div>
    </div>
    <footer><span><span class="footer-dot"></span> A little perspective on the road we share.</span><button class="text-button about-trigger">How it works ${icon("arrow", 14)}</button></footer>
  </main>
  <dialog id="about-dialog"><button id="close-about" class="dialog-close" aria-label="Close explanation">×</button><div class="eyebrow">BEHIND THE EXPERIMENT</div><h2>Traffic is a chain reaction.</h2><p>Each car accelerates toward its desired speed and brakes according to its distance and closing speed to the car ahead. Faster drivers use the left lane to overtake, then return right when there is room. Right-lane cars also respond to slower traffic ahead on the left to discourage passing on the right.</p><p>The orange driver deliberately stays left until you select <strong>Clear the left lane</strong>. It then finishes the pass at a target no lower than its current setting or the faster drivers’ target, waits for a safe gap, and merges right. Both driver controls allow targets up to 300 km/h. Recovery takes time as the following cars accelerate.</p><p>This is an illustrative, deterministic car-following model on a repeating 1.2 km road, not a calibrated traffic forecast or a complete implementation of traffic law. Cars are enlarged for visibility. “Faster drivers” can exceed your selected limit to represent that behavior, not recommend it.</p><p><strong>Try it:</strong> run the default scene for 30–60 simulated seconds, release the driver, and compare the speed trace. Higher density and a slower blocker make the effect more noticeable. Other slow vehicles and dense traffic can still limit recovery.</p><p class="dialog-note">Settings restart the scene. Playback speed changes simulated time only. Traffic flow is a density-based estimate, not a count at a roadside detector.</p></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const sim = new Simulation();
const renderer = new RoadRenderer($<HTMLCanvasElement>("#road"));
const chart = $<HTMLCanvasElement>("#speed-chart");
let paused = false;
let playbackSpeed = 1;
let previousFrame = performance.now();
let previousUI = 0;
let previousPhase = "";

function updateUI(): void {
  const metrics = sim.metrics;
  $("#average-speed").textContent = Math.round(metrics.speed).toString();
  $("#queue-count").textContent = metrics.queue.toString();
  $("#traffic-flow").textContent = Math.round(metrics.flow).toLocaleString(
    "en-CH",
  );
  const seconds = Math.floor(sim.time);
  $("#clock").textContent = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const phase = sim.phase;
  if (phase !== previousPhase) {
    previousPhase = phase;
    const release = $<HTMLButtonElement>("#release");
    release.disabled = phase !== "blocking";
    release.innerHTML =
      phase === "blocking"
        ? `Clear the left lane ${icon("arrow")}`
        : phase === "overtaking"
          ? "Overtaking…"
          : `Left lane released ${icon("check")}`;
    $("#road-status").textContent =
      phase === "blocking"
        ? "Left lane blocked"
        : phase === "overtaking"
          ? "Finding a safe gap"
          : "Blocker moved right";
    $(".road-badge").classList.toggle("is-clear", phase === "clear");
    $("#action-title").textContent =
      phase === "blocking"
        ? "Give traffic a little room."
        : phase === "overtaking"
          ? "A safe pass takes a moment."
          : "Room to move again.";
    $("#action-description").textContent =
      phase === "blocking"
        ? "Let the orange car finish overtaking and move back to the right."
        : phase === "overtaking"
          ? "The driver is finishing the pass and looking for a safe gap on the right."
          : "Watch the cars behind accelerate. Restart to run the experiment again.";
  }
  drawChart(chart, sim);
}

function updateRange(input: HTMLInputElement): void {
  input.style.setProperty(
    "--range-fill",
    `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
  );
}

function applySettings(): void {
  const settings: Settings = {
    speedLimit: Number($<HTMLInputElement>("#speed-limit").value),
    blockerSpeed: Number($<HTMLInputElement>("#blocker-speed").value),
    fasterSpeed: Number($<HTMLInputElement>("#faster-speed").value),
    vehicleCount: Number($<HTMLInputElement>("#vehicle-count").value),
  };
  $("#speed-limit-value").textContent = String(settings.speedLimit);
  $("#speed-sign").textContent = String(settings.speedLimit);
  $("#faster-speed-value").textContent = String(settings.fasterSpeed);
  $("#vehicle-count-value").textContent = String(settings.vehicleCount);
  $("#blocker-speed-value").textContent = String(settings.blockerSpeed);
  const difference = settings.blockerSpeed - settings.speedLimit;
  $("#below-limit").textContent =
    difference === 0
      ? "At the limit"
      : `${Math.abs(difference)} ${difference > 0 ? "above" : "below"} limit`;
  $("#density-name").textContent =
    settings.vehicleCount < 22
      ? "Light"
      : settings.vehicleCount > 32
        ? "Heavy"
        : "Moderate";
  document
    .querySelectorAll<HTMLInputElement>('input[type="range"]')
    .forEach(updateRange);
  sim.configure(settings);
  updateUI();
}

document
  .querySelectorAll<HTMLInputElement>('input[type="range"]')
  .forEach((input) => {
    updateRange(input);
    input.addEventListener("input", applySettings);
  });
$("#play-pause").addEventListener("click", () => {
  paused = !paused;
  $("#play-pause").innerHTML = icon(paused ? "play" : "pause");
  $("#play-pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  $(".live-label").classList.toggle("paused", paused);
});
$("#reset").addEventListener("click", () => {
  sim.reset();
  updateUI();
});
$("#release").addEventListener("click", () => {
  sim.release();
  updateUI();
});
$("#show-speeds").addEventListener("change", (event) => {
  renderer.showSpeeds = (event.target as HTMLInputElement).checked;
});
document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) =>
  button.addEventListener("click", () => {
    playbackSpeed = Number(button.dataset.speed);
    document
      .querySelectorAll<HTMLButtonElement>("[data-speed]")
      .forEach((other) => {
        other.classList.toggle("selected", other === button);
        other.setAttribute("aria-pressed", String(other === button));
      });
  }),
);
const dialog = $<HTMLDialogElement>("#about-dialog");
document
  .querySelectorAll(".about-trigger")
  .forEach((button) =>
    button.addEventListener("click", () => dialog.showModal()),
  );
$("#close-about").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  }
});
document.addEventListener("visibilitychange", () => {
  previousFrame = performance.now();
});

function frame(now: number): void {
  const dt = Math.min((now - previousFrame) / 1000, 0.1);
  previousFrame = now;
  if (!paused && !document.hidden) sim.step(dt * playbackSpeed);
  renderer.draw(sim);
  if (now - previousUI > 150) {
    updateUI();
    previousUI = now;
  }
  requestAnimationFrame(frame);
}
updateUI();
requestAnimationFrame(frame);
