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

test("the intervention completes and restart restores the blocker", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "5×" }).click();
  await page.getByRole("button", { name: "Clear the left lane" }).click();
  await expect(page.locator("#release")).toBeDisabled();
  await expect(page.locator("#road-status")).toHaveText("Blocker moved right", {
    timeout: 20000,
  });
  await expect(page.locator("#release")).toHaveText("Left lane released");
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
