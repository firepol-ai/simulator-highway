import { expect, test } from "@playwright/test";

test("simulation renders without browser errors and playback controls work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "One driver. A ripple effect." }),
  ).toBeVisible();
  await expect(page.locator("#clock")).not.toHaveText("00:00");
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const pausedAt = await page.locator("#clock").textContent();
  await page.waitForTimeout(1100);
  await expect(page.locator("#clock")).toHaveText(pausedAt!);
  await page.getByRole("button", { name: "5×" }).click();
  await expect(page.getByRole("button", { name: "5×" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await expect(page.locator("#clock")).not.toHaveText(pausedAt!);
  await page.getByLabel("Show speeds").uncheck();
  await expect(page.getByLabel("Show speeds")).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("the intervention toggles between clearing and occupying with the same scene", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "5×" }).click();
  await page.getByRole("button", { name: "Clear the left lane" }).click();
  await expect(
    page.getByRole("button", { name: "Occupy the left lane" }),
  ).toBeEnabled();
  await expect(page.locator("#road-status")).toHaveText("Blocker moved right", {
    timeout: 20000,
  });
  await expect(page.locator("#release")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Occupy the left lane" }).click();
  await expect(page.locator("#road-status")).toHaveText("Left lane blocked", {
    timeout: 20000,
  });
  await expect(page.locator("#release")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#clock")).not.toHaveText("00:00");
  await page.getByRole("button", { name: "Clear the left lane" }).click();
  await expect(page.locator("#road-status")).toHaveText("Blocker moved right", {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Restart simulation" }).click();
  await expect(page.locator("#road-status")).toHaveText("Left lane blocked");
  await expect(
    page.getByRole("button", { name: "Clear the left lane" }),
  ).toBeEnabled();
});

test("settings support independent driver speeds up to 300 and reset the experiment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.getByRole("slider", { name: "Speed limit" }).fill("60");
  await expect(page.locator("#speed-limit-value")).toHaveText("60");
  await expect(page.locator("#blocker-speed")).toHaveAttribute("max", "300");
  await expect(page.locator("#blocker-speed-value")).toHaveText("110");
  await page.getByRole("slider", { name: "Driver’s speed" }).fill("55");
  await expect(page.locator("#below-limit")).toHaveText("5 below limit");
  await page.getByRole("slider", { name: "Traffic density" }).fill("44");
  await expect(page.locator("#density-name")).toHaveText("Heavy");
  await expect(page.locator("#vehicle-count-value")).toHaveText("44");
  await page.getByRole("slider", { name: "Faster drivers" }).fill("300");
  await expect(page.locator("#faster-speed-value")).toHaveText("300");
  await page.getByRole("slider", { name: "Driver’s speed" }).fill("300");
  await expect(page.locator("#blocker-speed-value")).toHaveText("300");
  await expect(page.locator("#below-limit")).toHaveText("240 above limit");
  await page.getByRole("slider", { name: "Speed limit" }).fill("120");
  await expect(page.locator("#faster-speed-value")).toHaveText("300");
  await expect(page.locator("#blocker-speed-value")).toHaveText("300");
  await expect(page.locator("#below-limit")).toHaveText("180 above limit");
  await page.getByRole("slider", { name: "Driver’s speed" }).fill("120");
  await expect(page.locator("#below-limit")).toHaveText("At the limit");
  await expect(page.locator("#clock")).toHaveText("00:00");
});

test("mobile layout fits the viewport and explanation opens and closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Clear the left lane" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "About the simulation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

for (const mode of ["Crazy road rage", "007 mode"]) {
  test(`${mode} crashes the blocker and the scene can be restarted`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    for (const checkbox of await page.locator(".arcade-options input").all())
      await expect(checkbox).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Sound effects" }),
    ).not.toBeChecked();
    await page.getByRole("checkbox", { name: mode, exact: true }).check();
    await page.getByRole("button", { name: "5×" }).click();
    await expect(page.locator("#road-status")).toHaveText(
      "Blocker crashed off-road",
      { timeout: 15000 },
    );
    await expect(page.locator("#arcade-status")).toContainText(
      mode === "007 mode" ? "007 mode:" : "Road rage:",
    );
    await page.getByRole("button", { name: "Pause simulation" }).click();
    await page.getByRole("button", { name: "Restart to try again" }).click();
    await expect(page.locator("#road-status")).toHaveText("Left lane blocked");
    await expect(page.locator("#clock")).toHaveText("00:00");
    await expect(
      page.getByRole("checkbox", { name: mode, exact: true }),
    ).toBeChecked();
    await page.getByRole("checkbox", { name: mode, exact: true }).uncheck();
    await expect(page.locator("#arcade-status")).toHaveText(
      "All antics off. Just traffic being traffic.",
    );
    expect(errors).toEqual([]);
  });
}

test("a new blocker can be spawned without restarting the crashed scene", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Spawn new blocker" }),
  ).not.toBeVisible();
  await page.getByRole("checkbox", { name: "007 mode", exact: true }).check();
  await page.getByRole("button", { name: "5×" }).click();
  await expect(page.locator("#road-status")).toHaveText(
    "Blocker crashed off-road",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const time = await page.locator("#clock").textContent();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Spawn new blocker" }).click();
  await expect(page.locator("#road-status")).toHaveText("Left lane blocked");
  await expect(page.locator("#clock")).toHaveText(time!);
  await expect(page.locator("#arcade-status")).toContainText(
    "Existing wrecks remain off-road",
  );
  await expect(
    page.getByRole("button", { name: "Spawn new blocker" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "007 mode", exact: true }),
  ).toBeChecked();
  expect(errors).toEqual([]);
});

test("sound is opt-in and current effects stop on pause, reset, and mute", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const probe = { started: 0, active: 0, contexts: 0 };
    Reflect.set(window, "audioProbe", probe);
    const NativeAudioContext = window.AudioContext;
    function track<T extends AudioScheduledSourceNode>(source: T): T {
      const start = source.start.bind(source);
      source.start = (when?: number) => {
        probe.started++;
        probe.active++;
        start(when);
      };
      source.addEventListener("ended", () => probe.active--);
      return source;
    }
    window.AudioContext = class extends NativeAudioContext {
      constructor() {
        super();
        probe.contexts++;
      }
      createOscillator() {
        return track(super.createOscillator());
      }
      createBufferSource() {
        return track(super.createBufferSource());
      }
    };
  });
  await page.goto("/");
  await page
    .getByRole("checkbox", { name: "Horns and flashing lights" })
    .check();
  await page.getByRole("button", { name: "5×" }).click();
  await expect(page.locator("#arcade-status")).toContainText("honking", {
    timeout: 10000,
  });
  expect(
    await page.evaluate(() => Reflect.get(window, "audioProbe").contexts),
  ).toBe(0);
  await page.getByRole("checkbox", { name: "Sound effects" }).check();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioProbe").started))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioProbe").active))
    .toBe(0);
  const pausedStarts = await page.evaluate(
    () => Reflect.get(window, "audioProbe").started,
  );
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => Reflect.get(window, "audioProbe").started),
  ).toBe(pausedStarts);
  await page.getByRole("button", { name: "Restart simulation" }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioProbe").active))
    .toBe(0);
  await page.getByRole("checkbox", { name: "Sound effects" }).uncheck();
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await expect(page.locator("#arcade-status")).toContainText("honking", {
    timeout: 10000,
  });
  expect(
    await page.evaluate(() => Reflect.get(window, "audioProbe").started),
  ).toBe(pausedStarts);
  await page.getByRole("checkbox", { name: "Sound effects" }).check();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioProbe").active))
    .toBeGreaterThan(0);
  await page.getByRole("checkbox", { name: "Sound effects" }).uncheck();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "audioProbe").active))
    .toBe(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "audioProbe").contexts),
  ).toBe(1);
});

test("winding mode fills the window and preserves independent scene settings and pause state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const originalTime = await page.locator("#clock").textContent();
  await page.locator("#view-switch").click();
  const bounds = await page.locator(".simulation-panel").boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 1440, height: 1100 });
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.locator("#map-controls-toggle").click();
  await expect(page.locator("#vehicle-count")).toHaveAttribute("max", "800");
  await page.getByRole("slider", { name: "Speed limit" }).fill("300");
  await page
    .getByRole("slider", { name: "Right-lane slow drivers" })
    .fill("70");
  await expect(page.locator("#speed-limit-value")).toHaveText("300");
  await expect(page.locator("#right-lane-speed-value")).toHaveText("70");
  await page.keyboard.press("Escape");
  await expect(page.locator("#map-controls")).toBeHidden();
  await page.getByRole("button", { name: "Clear the left lane" }).click();
  await expect(
    page.getByRole("button", { name: "Occupy the left lane" }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#clock")).toHaveText(originalTime!);
  await expect(page.locator("#speed-limit-value")).toHaveText("120");
  await expect(
    page.getByRole("button", { name: "Resume simulation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear the left lane" }),
  ).toBeEnabled();
  await page.locator("#view-switch").click();
  await expect(
    page.getByRole("button", { name: "Occupy the left lane" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Resume simulation" }),
  ).toBeVisible();
  await page.locator("#map-controls-toggle").click();
  await expect(page.locator("#right-lane-speed-value")).toHaveText("70");
  expect(errors).toEqual([]);
});

test("winding controls remain usable on mobile and after rotation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#view-switch").click();
  await page.locator("#map-controls-toggle").click();
  await page
    .getByRole("slider", { name: "Right-lane slow drivers" })
    .fill("90");
  await page.getByRole("checkbox", { name: "007 mode", exact: true }).check();
  await page.locator("#close-map-controls").click();
  await page.getByRole("button", { name: "5×" }).click();
  await expect(page.locator("#road-status")).toHaveText(
    "Blocker crashed off-road",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await expect(
    page.getByRole("button", { name: "Spawn new blocker" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Spawn new blocker" }).click();
  await expect(page.locator("#road-status")).toHaveText("Left lane blocked");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator("#map-controls-toggle").click();
  await page.getByRole("slider", { name: "Speed limit" }).fill("200");
  await page.locator("#close-map-controls").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const canvas = await page.locator("#road").boundingBox();
  expect(canvas!.height).toBeGreaterThan(200);
  await page.locator("#view-switch").click();
  await expect(page.getByRole("slider", { name: "Speed limit" })).toBeVisible();
});

test("800-vehicle winding mode shows pending spawns and completes them after resuming", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#view-switch").click();
  await page.locator("#map-controls-toggle").click();
  await page.getByRole("slider", { name: "Traffic density" }).fill("800");
  await expect(page.locator("#vehicle-count-value")).toHaveText("800");
  await page.getByRole("checkbox", { name: "007 mode", exact: true }).check();
  await page.locator("#close-map-controls").click();
  await page.getByRole("button", { name: "5×" }).click();
  await expect(page.locator("#road-status")).toHaveText(
    "Blocker crashed off-road",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.getByRole("button", { name: "Spawn new blocker" }).click();
  await expect(
    page.getByRole("button", { name: "Waiting for gap…" }),
  ).toBeDisabled();
  await expect(page.locator("#action-title")).toHaveText(
    "Resume to open a gap.",
  );
  await expect(page.locator("#action-title")).toBeVisible();
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await expect(page.locator("#road-status")).toHaveText("Left lane blocked", {
    timeout: 15000,
  });
  await expect(page.locator("#spawn-blocker")).toBeHidden();
  await expect(page.locator("#release")).toBeEnabled();
  expect(errors).toEqual([]);
});
