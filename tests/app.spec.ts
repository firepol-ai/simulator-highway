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
  await expect(page.locator("#blocker-speed-value")).toHaveText("75");
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
