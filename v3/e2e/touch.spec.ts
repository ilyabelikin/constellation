import { expect, test, type Page } from "@playwright/test";

// iPad-style play: no Shift key, no right button. Long presses and the Queue
// toggle stand in for them; the camera answers to one- and two-finger gestures.
test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });

async function touch(page: Page, points: { x: number; y: number }[][], stepMs = 16) {
  const cdp = await page.context().newCDPSession(page);
  const frame = (pts: { x: number; y: number }[]) => pts.map((p, i) => ({ x: p.x, y: p.y, id: i }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: frame(points[0]) });
  for (const pts of points.slice(1)) {
    await page.waitForTimeout(stepMs);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: frame(pts) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
const hold = (x: number, y: number, ms: number) => Array.from({ length: Math.ceil(ms / 50) }, () => [{ x, y }]);

async function start(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.querySelector("details.advanced")?.setAttribute("open", ""));
  await page.fill("#lb-seed", "touch-e2e");
  await page.click("#lb-start");
  await expect(page.locator("#topbar")).toBeVisible();
  await page.evaluate(() => (window as any).__app.setSpeed(0));
}

test("long-pressing a build button queues it (Shift+click), and the Queue toggle does the same for taps", async ({ page }) => {
  await start(page);
  expect(await page.evaluate(() => (window as any).__app.touch)).toBe(true);
  await expect(page.locator("#minihelp")).toContainText("Long-press");
  const colony = await page.evaluate(() => {
    const app = (window as any).__app;
    app.game.player.resources = { credits: 0, metals: 0, energy: 0, exotics: 0 };
    const c = app.game.playerColonies()[0];
    app.select({ kind: "body", id: c.bodyId });
    return c.id;
  });
  const lab = page.locator(`#details [data-action="build:${colony}:research_lab"]`);
  await expect(lab).toBeVisible();
  const box = (await lab.boundingBox())!;
  await touch(page, hold(box.x + box.width / 2, box.y + box.height / 2, 700), 50);
  await expect.poll(() => page.evaluate((id) => (window as any).__app.game.state.colonies[id].queue.length, colony)).toBe(1);
  expect(await page.evaluate((id) => (window as any).__app.game.state.colonies[id].queue[0].unpaid, colony)).toBe(true);
  // Queue mode: a plain tap queues too.
  await page.locator('#viewbar [data-action="queuemode"]').tap();
  expect(await page.evaluate(() => (window as any).__app.queueMode)).toBe(true);
  await page.locator(`#details [data-action="build:${colony}:trade_hub"]`).tap();
  await expect.poll(() => page.evaluate((id) => (window as any).__app.game.state.colonies[id].queue.length, colony)).toBe(2);
});

test("a long press on the map sends the selected fleet there; pinch zooms", async ({ page }) => {
  await start(page);
  const ids = await page.evaluate(() => {
    const app = (window as any).__app;
    const s = app.game.state;
    const guard = Object.values(s.fleets).find((f: any) => f.empireId === s.playerId && f.name === "Home Guard") as any;
    app.select({ kind: "fleet", id: guard.id });
    const home = app.game.playerColonies()[0];
    const target = s.systems[home.systemId].starIds[0];
    return { guard: guard.id, target };
  });
  await page.waitForTimeout(800);
  // Any world of the home system that is on screen, clear of the side panels.
  const at = await page.evaluate((guardId) => {
    const a = (window as any).__app;
    const s = a.game.state;
    const home = s.fleets[guardId].systemId;
    for (const id of s.systems[home].bodyIds) {
      const b = s.bodies[id];
      if (b.kind === "belt" || b.id === s.fleets[guardId].orbitBodyId) continue;
      const p = a.engine.project(a.systemView.bodyWorld(b));
      const el = document.elementFromPoint(p.x, p.y);
      if (p.x > 260 && p.x < 820 && p.y > 130 && p.y < 700 && el?.tagName === "CANVAS") return p;
    }
    return null;
  }, ids.guard);
  expect(at).not.toBeNull();
  await touch(page, hold(at!.x, at!.y, 800), 50);
  await expect.poll(() => page.evaluate((id) => (window as any).__app.game.state.fleets[id].order?.kind, ids.guard)).toBe("move");
  // Pinch: fingers spreading apart zoom in.
  const before = await page.evaluate(() => (window as any).__app.engine.rig.goalDistance);
  const cx = 590, cy = 420;
  const frames = Array.from({ length: 12 }, (_, i) => [{ x: cx - 30 - i * 12, y: cy }, { x: cx + 30 + i * 12, y: cy }]);
  await touch(page, frames);
  const after = await page.evaluate(() => (window as any).__app.engine.rig.goalDistance);
  expect(after).toBeLessThan(before * 0.8);
});
