import "./style.css";
import { Simulation, type Settings, type TrafficEvent } from "./simulation.ts";
import { RoadRenderer, drawChart } from "./renderer.ts";
import { WindingRenderer } from "./winding-renderer.ts";
import { TrafficAudio } from "./audio.ts";

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
      <div class="location"><span class="swiss-flag" role="img" aria-label="Switzerland">🇨🇭</span><div>Swiss-inspired, your rules<small>Keep right. Set your own speeds.</small></div></div>
    </section>
    <div class="workspace">
      <aside class="settings panel">
        <div class="section-title"><h2>${icon("sliders", 17)} Set the scene</h2><span class="small-label">01</span></div>
        <p class="section-description">Small changes. Different traffic.</p>
        <div class="setting">
          <label for="speed-limit">Speed limit <span class="limit-sign" id="speed-sign">120</span></label>
          <div class="range-value"><output id="speed-limit-value" for="speed-limit">120</output><span>km/h</span></div>
          <input id="speed-limit" type="range" min="60" max="300" step="10" value="120" />
          <div class="range-ends"><span>60 km/h</span><span>300 km/h</span></div>
        </div>
        <div class="setting">
          <label for="faster-speed">Faster drivers <span class="setting-dot green"></span></label>
          <div class="range-value"><output id="faster-speed-value" for="faster-speed">135</output><span>km/h target speed</span></div>
          <input id="faster-speed" type="range" min="60" max="300" step="5" value="135" />
          <div class="range-ends"><span>60 km/h</span><span>300 km/h</span></div>
        </div>
        <div class="setting">
          <label for="vehicle-count">Traffic density <output class="value-pill" id="density-name">Moderate</output></label>
          <div class="range-value"><output id="vehicle-count-value" for="vehicle-count">26</output><span>vehicles on the road</span></div>
          <input id="vehicle-count" type="range" min="12" max="44" step="2" value="26" />
          <div class="range-ends"><span>Light</span><span>Heavy</span></div>
        </div>
        <div class="setting right-driver-setting">
          <label for="right-lane-speed">Right-lane slow drivers</label>
          <div class="range-value"><output id="right-lane-speed-value" for="right-lane-speed">108</output><span>km/h target speed</span></div>
          <input id="right-lane-speed" type="range" min="40" max="300" step="1" value="108" />
          <div class="range-ends"><span>40 km/h</span><span>300 km/h</span></div>
        </div>
        <div class="blocker-setting">
          <div class="blocker-title"><span class="setting-dot amber"></span><h3>The left-lane blocker</h3></div>
          <p>One driver stays in the overtaking lane. Faster cars behind have to adapt.</p>
          <label for="blocker-speed">Driver’s speed</label>
          <div class="range-value"><output id="blocker-speed-value" for="blocker-speed">110</output><span>km/h</span><span class="below-limit" id="below-limit">10 below limit</span></div>
          <input id="blocker-speed" class="amber-range" type="range" min="40" max="300" step="1" value="110" />
          <div class="range-ends"><span>40 km/h</span><span>300 km/h</span></div>
        </div>
        <p class="settings-note">Changing a setting restarts the experiment.</p>
      </aside>
      <div class="main-column">
        <section class="simulation-panel panel" aria-label="Highway simulation">
          <div class="simulation-toolbar"><div class="live-label"><span></span> LIVE SIMULATION <span class="divider">/</span><span class="road-name">Two lanes, one direction</span></div><div class="view-tools"><button id="view-switch" class="view-button" aria-pressed="false">Winding road ⤢</button><div class="timer">${icon("road", 14)}<span id="clock">00:00</span></div></div></div>
          <div class="road-container"><canvas id="road" aria-label="Top-down animated highway: cars travel to the right, with the overtaking lane above the cruising lane. The blocking driver is orange." role="img"></canvas><div class="road-badge"><span class="badge-dot"></span> <span id="road-status">Left lane blocked</span></div><div class="road-scale">TOP VIEW <span>↗</span> 1.2 KM LOOP</div></div>
          <div class="playback-toolbar"><div class="playback-left"><button id="play-pause" class="icon-button" aria-label="Pause simulation">${icon("pause")}</button><button id="reset" class="icon-button" aria-label="Restart simulation">${icon("reset", 16)}</button><span class="toolbar-divider"></span><div class="playback-speeds" role="group" aria-label="Playback speed"><button data-speed="1" class="selected" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="5" aria-pressed="false">5×</button></div></div><div class="playback-right"><span id="map-summary" hidden></span><button id="map-controls-toggle" class="view-button" hidden aria-expanded="false" aria-controls="map-controls">Controls ${icon("sliders", 14)}</button><label class="toggle-label"><input type="checkbox" id="show-speeds" checked /><span class="toggle"></span>Show speeds</label></div></div>
        </section>
        <section class="intervention" aria-label="Clear the blocking driver"><div class="intervention-icon">${icon("road", 24)}</div><div class="intervention-copy"><h2 id="action-title">Give traffic a little room.</h2><p id="action-description">Let the orange car finish overtaking and move back to the right.</p></div><div class="intervention-actions"><button id="spawn-blocker" class="primary-button" hidden>Spawn new blocker</button><button id="release" class="primary-button">Clear the left lane ${icon("arrow")}</button></div></section>
        <section class="arcade-panel panel" aria-label="Arcade options">
          <div class="arcade-heading"><div><span class="eyebrow">A DETOUR FROM REALITY</span><h2>A little less civilised.</h2></div><label class="toggle-label sound-control"><input type="checkbox" id="sound-enabled" /><span class="toggle"></span>Sound effects</label></div>
          <p class="arcade-intro">Optional arcade antics. Drivers react after getting stuck behind slower traffic.</p>
          <div class="arcade-options">
            <label class="arcade-option"><span><strong>Random right-side passing</strong><small>Pass slower left-lane traffic on the right, then cut back ahead.</small></span><span class="toggle-label"><input id="arcade-undertaking" type="checkbox" aria-label="Random right-side passing" /><span class="toggle"></span></span></label>
            <label class="arcade-option"><span><strong>Horns & flashing lights</strong><small>Only impatient drivers in the left lane.</small></span><span class="toggle-label"><input id="arcade-signals" type="checkbox" aria-label="Horns and flashing lights" /><span class="toggle"></span></span></label>
            <label class="arcade-option"><span><strong>Crazy road rage</strong><small>A queued driver rams the blocker off-road.</small></span><span class="toggle-label"><input id="arcade-rage" type="checkbox" aria-label="Crazy road rage" /><span class="toggle"></span></span></label>
            <label class="arcade-option"><span><strong>007 mode</strong><small>Car-mounted machine guns. A cinematic exit.</small></span><span class="toggle-label"><input id="arcade-spy" type="checkbox" aria-label="007 mode" /><span class="toggle"></span></span></label>
          </div>
          <p id="arcade-status" class="arcade-status" role="status">All antics off. Just traffic being traffic.</p>
        </section>
        <section class="metrics" aria-label="Live traffic statistics">
          <div class="metric panel"><div class="metric-label">Average speed <span>↗</span></div><div class="metric-number"><span id="average-speed">0</span><span>km/h</span></div><div class="metric-caption">All vehicles, both lanes</div></div>
          <div class="metric panel"><div class="metric-label">Vehicles held back <span class="amber-text">≋</span></div><div class="metric-number"><span id="queue-count">0</span><span>vehicles</span></div><div class="metric-caption">8+ km/h below desired speed</div></div>
          <div class="metric panel"><div class="metric-label">Traffic flow <span>⇢</span></div><div class="metric-number"><span id="traffic-flow">0</span><span>veh/h</span></div><div class="metric-caption">Estimate: density × average speed</div></div>
        </section>
        <section class="chart-panel panel"><div class="chart-header"><h2>Every slowdown tells a story.</h2><div class="chart-legend"><span><i></i>Average speed</span><span><i class="dashed"></i>Speed limit</span></div></div><canvas id="speed-chart" role="img" aria-label="Average traffic speed over the last two simulated minutes. A vertical marker shows when the blocker was released."></canvas><div class="chart-footer"><span>SPEED (KM/H)</span><span>SIMULATED TIME →</span></div></section>
      </div>
    </div>
    <footer><span><span class="footer-dot"></span> A little perspective on the road we share.</span><div class="footer-links"><a class="text-button" href="https://github.com/firepol-ai/simulator-highway" target="_blank" rel="noopener noreferrer">Source on GitHub ↗</a><button class="text-button about-trigger">How it works ${icon("arrow", 14)}</button></div></footer>
  </main>
  <aside id="map-controls" aria-label="Winding road controls" hidden><button id="close-map-controls" class="view-button">Close controls ×</button></aside>
  <dialog id="about-dialog"><button id="close-about" class="dialog-close" aria-label="Close explanation">×</button><div class="eyebrow">BEHIND THE EXPERIMENT</div><h2>Traffic is a chain reaction.</h2><p>Each car accelerates toward its desired speed and brakes according to its distance and closing speed to the car ahead. Faster drivers use the left lane to overtake, then return right when there is room. Right-lane cars also respond to slower traffic ahead on the left to discourage passing on the right.</p><p>The orange driver deliberately stays left until you select <strong>Clear the left lane</strong>. It then finishes the pass at a target no lower than its current setting or the faster drivers’ target, waits for a safe gap, and merges right. The limit and driver controls allow targets up to 300 km/h. “Right-lane slow drivers” sets the trucks’ desired speed independently. Recovery takes time as the following cars accelerate.</p><p>This is an illustrative, deterministic car-following model on a repeating 1.2 km road or a 6 km winding circuit, not a calibrated traffic forecast or a complete implementation of traffic law. Cars are enlarged for visibility. “Faster drivers” can exceed your selected limit to represent that behavior, not recommend it.</p><p>Select <strong>Winding road</strong> for a full-window circuit with more vehicles at the same density. Open <strong>Controls</strong> to adjust its settings. Each mode preserves its own traffic and pauses while you use the other. Bends are schematic: they do not impose cornering speed limits.</p><p><strong>Try it:</strong> run the default scene for 30–60 simulated seconds, release the driver, and compare the speed trace. Higher density and a slower blocker make the effect more noticeable. Other slow vehicles and dense traffic can still limit recovery.</p><p><strong>Arcade options:</strong> enable random right-side passes, horns and headlight flashes, or fictional road-rage and 007 crash sequences. These start only after a driver is held up. Sound is opt-in. Releasing the blocker cancels an attack. After a crash, Spawn new blocker adds another driver while keeping the wreck and history; restart clears the scene. Behavior switches apply live, and reset keeps your selections.</p><p class="dialog-note">Settings restart the scene. Playback speed changes simulated time only. Traffic flow is a density-based estimate, not a count at a roadside detector.</p></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const straightSim = new Simulation();
let sim = straightSim;
let windingSim: Simulation | null = null;
let windingMode = false;
const pausedModes = { straight: false, winding: false };
const controlHomes = new Map<HTMLElement, Comment>();
const renderer = new RoadRenderer($<HTMLCanvasElement>("#road"));
const windingRenderer = new WindingRenderer($<HTMLCanvasElement>("#road"));
const audio = new TrafficAudio();
const chart = $<HTMLCanvasElement>("#speed-chart");
let paused = false;
let playbackSpeed = 1;
let previousFrame = performance.now();
let previousUI = 0;
let previousPhase = "";
let lastAudioEvent = 0;

function toggleMapControls(open: boolean): void {
  $("#map-controls").hidden = !open;
  $("#map-controls-toggle").setAttribute("aria-expanded", String(open));
}

function switchView(): void {
  pausedModes[windingMode ? "winding" : "straight"] = paused;
  windingMode = !windingMode;
  if (windingMode && !windingSim)
    windingSim = new Simulation(
      {
        ...straightSim.settings,
        vehicleCount: straightSim.settings.vehicleCount * 5,
      },
      straightSim.arcade,
      6000,
    );
  sim = windingMode ? windingSim! : straightSim;
  paused = pausedModes[windingMode ? "winding" : "straight"];
  audio.stop();
  lastAudioEvent = sim.events.at(-1)?.id ?? 0;
  previousPhase = "";
  document.body.classList.toggle("winding-mode", windingMode);
  if (windingMode) {
    for (const selector of [".settings", ".arcade-panel"]) {
      const element = $(selector);
      const placeholder = document.createComment("Control panel position");
      element.before(placeholder);
      controlHomes.set(element, placeholder);
      $("#map-controls").append(element);
    }
  } else {
    for (const [element, placeholder] of controlHomes) {
      placeholder.replaceWith(element);
    }
    controlHomes.clear();
  }
  toggleMapControls(false);
  $("#map-controls-toggle").hidden = $("#map-summary").hidden = !windingMode;
  $("#view-switch").textContent = windingMode
    ? "Back to straight road ↙"
    : "Winding road ⤢";
  $("#view-switch").setAttribute("aria-pressed", String(windingMode));
  $(".road-name").textContent = windingMode
    ? "6 km · winding circuit"
    : "Two lanes, one direction";
  $(".road-scale").innerHTML = windingMode
    ? "6 KM CIRCUIT · KEEP RIGHT, OVERTAKE LEFT"
    : "TOP VIEW <span>↗</span> 1.2 KM LOOP";
  $("#road").setAttribute(
    "aria-label",
    windingMode
      ? "Full-window winding highway: a 6 kilometre two-lane circuit with alternating S bends. The orange car is the blocker."
      : "Top-down animated highway: cars travel to the right, with the overtaking lane above the cruising lane. The blocking driver is orange.",
  );
  $("#play-pause").innerHTML = icon(paused ? "play" : "pause");
  $("#play-pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  $(".live-label").classList.toggle("paused", paused);
  for (const [id, enabled] of Object.entries({
    undertaking: sim.arcade.undertaking,
    signals: sim.arcade.signals,
    rage: sim.arcade.roadRage,
    spy: sim.arcade.spyMode,
  }))
    $<HTMLInputElement>(`#arcade-${id}`).checked = enabled;
  syncSettings();
  updateUI();
}

$("#view-switch").addEventListener("click", switchView);
$("#map-controls-toggle").addEventListener("click", () =>
  toggleMapControls(Boolean($("#map-controls").hidden)),
);
$("#close-map-controls").addEventListener("click", () => {
  toggleMapControls(false);
  $("#map-controls-toggle").focus();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key !== "Escape" ||
    !windingMode ||
    document.querySelector("dialog[open]")
  )
    return;
  if (!$("#map-controls").hidden) toggleMapControls(false);
  else switchView();
});

const eventMessage = (event: TrafficEvent): string =>
  ({
    horn: `Car ${event.actorId} is honking and flashing its lights.`,
    undertake: `Car ${event.actorId} is passing on the right.`,
    return: `Car ${event.actorId} has returned to the left lane.`,
    spawn: `A new blocker has joined the left lane. Existing wrecks remain off-road.`,
    ram: `Car ${event.actorId} has lost its patience. Brace for impact.`,
    shot: `Car ${event.actorId}: machine guns deployed.`,
    crash:
      sim.crash?.cause === "gun"
        ? "007 mode: the blocker has crashed off-road."
        : "Road rage: the blocker has been rammed off-road.",
  })[event.kind];

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
    $("#spawn-blocker").hidden = phase !== "crashed";
    $(".intervention").classList.toggle("has-wreck", phase === "crashed");
    const blockingRequested = phase === "blocking" || phase === "returning";
    if (phase === "crashed") release.removeAttribute("aria-pressed");
    else release.setAttribute("aria-pressed", String(blockingRequested));
    release.innerHTML =
      phase === "crashed"
        ? "Restart to try again"
        : blockingRequested
          ? `Clear the left lane ${icon("arrow")}`
          : `Occupy the left lane ${icon("road")}`;
    $("#road-status").textContent =
      phase === "crashed"
        ? "Blocker crashed off-road"
        : phase === "blocking"
          ? "Left lane blocked"
          : phase === "returning"
            ? "Moving back to the left"
            : phase === "overtaking"
              ? "Finding a safe gap"
              : "Blocker moved right";
    $(".road-badge").classList.toggle("is-clear", phase === "clear");
    $(".road-badge").classList.toggle("is-crashed", phase === "crashed");
    $("#action-title").textContent =
      phase === "crashed"
        ? "Well, that escalated."
        : phase === "blocking"
          ? "Give traffic a little room."
          : phase === "returning"
            ? "Back for another round."
            : phase === "overtaking"
              ? "A safe pass takes a moment."
              : "Room to move again.";
    $("#action-description").textContent =
      phase === "crashed"
        ? "Leave the wreck in place and spawn another blocker, or restart the whole scene."
        : phase === "blocking"
          ? "Let the orange car finish overtaking and move back to the right."
          : phase === "returning"
            ? "The same driver is waiting for a gap to move left and resume blocking."
            : phase === "overtaking"
              ? "The driver is finishing the pass and looking for a safe gap on the right."
              : "Watch traffic recover, or occupy the left lane again with the same driver.";
  }
  const latest = sim.events.at(-1);
  const active = Object.values(sim.arcade).some(Boolean);
  const status =
    latest && (sim.time - latest.time < 8 || sim.crash)
      ? eventMessage(latest)
      : active
        ? "Arcade antics enabled. Waiting for an impatient driver…"
        : "All antics off. Just traffic being traffic.";
  if ($("#arcade-status").textContent !== status)
    $("#arcade-status").textContent = status;
  $("#map-summary").textContent =
    `${Math.round(metrics.speed)} km/h avg · ${metrics.queue} held back`;
  if (!windingMode) drawChart(chart, sim);
}

function updateRange(input: HTMLInputElement): void {
  input.style.setProperty(
    "--range-fill",
    `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
  );
}

function syncSettings(): void {
  const settings = sim.settings;
  const scale = sim.roadLength / 1200;
  const density = $<HTMLInputElement>("#vehicle-count");
  density.min = String(12 * scale);
  density.max = String(44 * scale);
  density.step = String(2 * scale);
  for (const [id, value] of Object.entries({
    "speed-limit": settings.speedLimit,
    "faster-speed": settings.fasterSpeed,
    "blocker-speed": settings.blockerSpeed,
    "vehicle-count": settings.vehicleCount,
    "right-lane-speed": settings.rightLaneSpeed ?? settings.speedLimit - 12,
  })) {
    $<HTMLInputElement>(`#${id}`).value = String(value);
  }
  $("#right-lane-speed-value").textContent =
    $<HTMLInputElement>("#right-lane-speed").value;
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
    settings.vehicleCount / scale < 22
      ? "Light"
      : settings.vehicleCount / scale > 32
        ? "Heavy"
        : "Moderate";
  document
    .querySelectorAll<HTMLInputElement>('input[type="range"]')
    .forEach(updateRange);
}

function applySettings(): void {
  const settings: Settings = {
    speedLimit: Number($<HTMLInputElement>("#speed-limit").value),
    blockerSpeed: Number($<HTMLInputElement>("#blocker-speed").value),
    fasterSpeed: Number($<HTMLInputElement>("#faster-speed").value),
    vehicleCount: Number($<HTMLInputElement>("#vehicle-count").value),
    rightLaneSpeed: Number($<HTMLInputElement>("#right-lane-speed").value),
  };
  sim.configure(settings);
  syncSettings();
  audio.stop();
  lastAudioEvent = 0;
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
  if (paused) audio.stop();
  else if (audio.enabled) void audio.enable();
});
$("#reset").addEventListener("click", () => {
  sim.reset();
  audio.stop();
  lastAudioEvent = 0;
  updateUI();
});
$("#release").addEventListener("click", () => {
  if (sim.crash) {
    sim.reset();
    audio.stop();
    lastAudioEvent = 0;
  } else if (sim.phase === "blocking" || sim.phase === "returning")
    sim.release();
  else sim.occupy();
  updateUI();
});
$("#show-speeds").addEventListener("change", (event) => {
  renderer.showSpeeds = windingRenderer.showSpeeds = (
    event.target as HTMLInputElement
  ).checked;
});
$("#spawn-blocker").addEventListener("click", () => {
  if (sim.spawnBlocker()) updateUI();
  else
    $("#action-description").textContent =
      "No room in the left lane yet. Let traffic move, then try spawning again.";
});
document
  .querySelectorAll<HTMLInputElement>(".arcade-options input")
  .forEach((input) =>
    input.addEventListener("change", () => {
      sim.setArcade({
        undertaking: $<HTMLInputElement>("#arcade-undertaking").checked,
        signals: $<HTMLInputElement>("#arcade-signals").checked,
        roadRage: $<HTMLInputElement>("#arcade-rage").checked,
        spyMode: $<HTMLInputElement>("#arcade-spy").checked,
      });
      audio.stop();
      updateUI();
    }),
  );
$("#sound-enabled").addEventListener("change", async () => {
  const checkbox = $<HTMLInputElement>("#sound-enabled");
  if (checkbox.checked) {
    const enabled = await audio.enable();
    if (!enabled && checkbox.checked) {
      checkbox.checked = false;
      checkbox.setAttribute("aria-describedby", "sound-error");
      if (!$("#sound-error")) {
        const error = document.createElement("p");
        error.id = "sound-error";
        error.className = "arcade-intro";
        error.textContent =
          "Audio could not start in this browser. The visual effects still work.";
        $(".arcade-panel").append(error);
      }
    }
  } else audio.disable();
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
  if (document.hidden) audio.stop();
});

function frame(now: number): void {
  const dt = Math.min((now - previousFrame) / 1000, 0.1);
  previousFrame = now;
  if (!paused && !document.hidden) sim.step(dt * playbackSpeed);
  for (const event of sim.events) {
    if (event.id > lastAudioEvent) {
      if (!paused && !document.hidden) audio.play(event);
      lastAudioEvent = event.id;
    }
  }
  if (windingMode) windingRenderer.draw(sim);
  else renderer.draw(sim);
  if (now - previousUI > 150) {
    updateUI();
    previousUI = now;
  }
  requestAnimationFrame(frame);
}
syncSettings();
updateUI();
requestAnimationFrame(frame);
