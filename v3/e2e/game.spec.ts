import { expect, test, type Page } from "@playwright/test";

// These tests drive the real game UI in Chromium (software WebGL), so they
// are deliberately patient: SwiftShader renders only a few frames per second.

const consoleErrors: string[] = [];

async function canvasStats(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ lit: number; distinct: number }>((resolve) => {
        requestAnimationFrame(() => {
          const src = document.querySelector("#canvas canvas") as HTMLCanvasElement;
          const c = document.createElement("canvas");
          c.width = 160;
          c.height = 100;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(src, 0, 0, 160, 100);
          const d = ctx.getImageData(0, 0, 160, 100).data;
          let lit = 0;
          const colors = new Set<number>();
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
            colors.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
          }
          resolve({ lit, distinct: colors.size });
        });
      }),
  );
}

/** Screen position of a body in the current system view. */
async function bodyScreenPos(page: Page, bodyId: string) {
  return page.evaluate((id) => {
    const a = (window as any).__app;
    const v = a.systemView;
    const p = v.bodyWorld(a.game.state.bodies[id]);
    return a.engine.project(p);
  }, bodyId);
}

async function startGame(page: Page, seed = "e2e-seed") {
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("ERR_CERT") && !m.text().includes("fonts.g")) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".title")).toHaveText("CONSTELLATION");
  await page.fill("#lb-seed", seed);
  await page.click("#lb-start");
  await expect(page.locator("#topbar")).toBeVisible();
  await expect(page.locator("#lobby")).toBeHidden();
}

test.beforeEach(() => {
  consoleErrors.length = 0;
});

test.afterEach(() => {
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("title screen renders a live 3D scene and species choices", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".species")).toHaveCount(6);
  await page.click('[data-species="kraal"]');
  await expect(page.locator("#lb-name")).toHaveValue("Kraal Hive");
  await page.waitForTimeout(1500);
  const stats = await canvasStats(page);
  expect(stats.lit).toBeGreaterThan(50);
  expect(stats.distinct).toBeGreaterThan(40);
  await page.click('[data-a="help"]');
  await expect(page.getByText("HOW TO PLAY")).toBeVisible();
});

test("new game shows HUD, homeworld details and builds things", async ({ page }) => {
  await startGame(page);
  await expect(page.locator("#topbar .res.credits")).toContainText("250");
  await expect(page.locator("#outliner")).toContainText("Home Guard");
  await expect(page.locator("#details")).toContainText("Capital of");
  const stats = await canvasStats(page);
  expect(stats.distinct).toBeGreaterThan(40);

  // Queue a Trade Hub and a Corvette from the colony panel.
  await page.click('[data-action="speed:0"]');
  await page.locator('#details [data-action$=":trade_hub"]').click();
  await expect(page.locator("#details .queue-item")).toHaveCount(1);
  await page.locator('#details [data-action$=":corvette"]').click();
  await expect(page.locator("#details .queue-item")).toHaveCount(2);
  await expect(page.locator("#topbar .res.credits")).toContainText("170");

  // Run time forward; the building completes and the log says so.
  await page.evaluate(() => (window as any).__app.game.advance(20));
  await expect(page.locator("#details")).toContainText("Trade Hub", { timeout: 10000 });
  await expect(page.locator("#log")).toContainText("Trade Hub completed");
});

test("fleet orders: select, right-click a planet, then travel via the galaxy map", async ({ page }) => {
  await startGame(page);
  await page.click('[data-action="speed:0"]');
  await page.locator("#outliner .row", { hasText: "Home Guard" }).click();
  await expect(page.locator("#details h2")).toContainText("Home Guard");

  // Right-click another planet in the system.
  const target = await page.evaluate(() => {
    const a = (window as any).__app;
    const s = a.game.state;
    const home = a.game.playerColonies()[0];
    return s.systems[home.systemId].bodyIds.map((id: string) => s.bodies[id]).find((b: any) => b.kind === "planet" && b.id !== home.bodyId).id;
  });
  await page.evaluate(() => {
    const a = (window as any).__app;
    a.engine.rig.goalDistance = a.engine.rig.maxDistance * 0.4;
    a.engine.rig.follow = null;
    a.engine.rig.goalTarget.set(0, 0, 0);
    a.engine.rig.snap();
  });
  await page.waitForTimeout(1500);
  const pos = await bodyScreenPos(page, target);
  expect(pos).not.toBeNull();
  await page.mouse.click(pos!.x, pos!.y, { button: "right" });
  await expect(page.locator(".toast.good")).toContainText("Home Guard");
  const order = await page.evaluate(() => {
    const a = (window as any).__app;
    return a.game.state.fleets[a.activeFleetId].order;
  });
  expect(order.kind).toBe("move");
  expect(order.bodyId).toBe(target);

  // Galaxy map: send the fleet to a neighbouring system.
  await page.keyboard.press("g");
  await expect(page.locator("#viewbar button.active")).toContainText("Galaxy");
  const neighbour = await page.evaluate(() => {
    const a = (window as any).__app;
    return a.game.state.systems[a.systemId].gates[0].otherSystemId;
  });
  await page.evaluate((id) => {
    const a = (window as any).__app;
    a.select({ kind: "system", id });
  }, neighbour);
  await page.locator('#details [data-action^="send:"]').click();
  await expect(page.locator(".toast.good").last()).toContainText("Course plotted");
  await page.evaluate(() => (window as any).__app.game.advance(80));
  const arrived = await page.evaluate((id) => {
    const a = (window as any).__app;
    const f = a.game.state.fleets[a.activeFleetId];
    return f.systemId === id || f.transit?.to === id;
  }, neighbour);
  expect(arrived).toBe(true);
});

test("research tree opens and sets a project, prerequisites auto-queue", async ({ page }) => {
  await startGame(page);
  await page.keyboard.press("r");
  await expect(page.locator(".modal h2")).toHaveText("Research");
  await expect(page.locator(".tech")).toHaveCount(42);
  await page.locator('.tech[data-action="tech:cruisers"]').click();
  const r = await page.evaluate(() => (window as any).__app.game.player.research);
  expect(r.current).toBe("frigates");
  expect(r.queue).toEqual(["destroyers", "cruisers"]);
  await expect(page.locator(".tech.current")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
});

test("combat renders weapon effects and explosions", async ({ page }) => {
  await startGame(page, "e2e-battle");
  await page.evaluate(() => {
    const a = (window as any).__app;
    const s = a.game.state;
    const home = a.game.playerColonies()[0];
    const guard = Object.values(s.fleets).find((f: any) => f.empireId === s.playerId && f.name === "Home Guard") as any;
    const pf = Object.values(s.fleets).find((f: any) => f.empireId === "pirates") as any;
    pf.systemId = home.systemId;
    pf.order = null;
    pf.orbitBodyId = null;
    guard.order = null;
    guard.orbitBodyId = null;
    guard.pos = { x: 1, y: 0, z: 0.3 };
    pf.pos = { x: 1.5, y: 0, z: 0.4 };
    a.enterSystem(home.systemId, { kind: "fleet", id: guard.id });
    a.setSpeed(2);
  });
  await expect(page.locator("#log")).toContainText("Battle erupted", { timeout: 30000 });
  let maxEffects = 0;
  for (let i = 0; i < 20; i++) {
    maxEffects = Math.max(maxEffects, await page.evaluate(() => (window as any).__app.systemView.effects.count));
    if (maxEffects > 5) break;
    await page.waitForTimeout(500);
  }
  expect(maxEffects).toBeGreaterThan(5);
  await expect(page.locator("#details")).toContainText("IN COMBAT");
});

test("save, reload and continue", async ({ page }) => {
  await startGame(page, "e2e-save");
  await page.evaluate(() => (window as any).__app.game.advance(30));
  const day = await page.evaluate(() => (window as any).__app.game.state.day);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal h2")).toHaveText("Menu");
  await page.click('.modal [data-action="save"]');
  await expect(page.locator(".toast.good").last()).toContainText("Game saved");
  await page.reload();
  await page.click('[data-a="continue"]');
  await expect(page.locator("#topbar")).toBeVisible();
  const loadedDay = await page.evaluate(() => (window as any).__app.game.state.day);
  expect(loadedDay).toBeGreaterThanOrEqual(day);
  expect(loadedDay).toBeLessThan(day + 5);
});

test("empires screen lists rivals and supports declaring war", async ({ page }) => {
  await startGame(page);
  page.on("dialog", (d) => d.accept());
  await page.keyboard.press("e");
  await expect(page.locator(".empire-card")).toHaveCount(5);
  await page.locator('.empire-card [data-action^="war:"]').first().click();
  await expect(page.locator(".empire-card .tag.war").first()).toBeVisible();
  await expect(page.locator("#log")).toContainText("declared war");
});

test("station panel dispatches the constructor to build a solar array", async ({ page }) => {
  await startGame(page, "e2e-station");
  await page.click('[data-action="speed:0"]');
  await page.evaluate(() => {
    const a = (window as any).__app;
    const s = a.game.state;
    a.select({ kind: "body", id: s.systems[a.systemId].starIds[0] });
  });
  const btn = page.locator('#details [data-action$=":solar_array"]');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator(".toast.good").last()).toContainText("Builders dispatched");
  await page.evaluate(() => (window as any).__app.game.advance(60));
  await expect(page.locator("#log")).toContainText("Solar Array completed", { timeout: 10000 });
});

test("a long game keeps running and rendering without errors", async ({ page }) => {
  await startGame(page, "e2e-long");
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => (window as any).__app.game.advance(100));
    await page.keyboard.press(i % 2 ? "g" : "h");
    await page.waitForTimeout(800);
  }
  const summary = await page.evaluate(() => {
    const s = (window as any).__app.game.state;
    return { day: s.day, empires: Object.values(s.empires).filter((e: any) => e.alive).length, colonies: Object.keys(s.colonies).length };
  });
  expect(summary.day).toBeGreaterThanOrEqual(600);
  expect(summary.colonies).toBeGreaterThan(4);
  const stats = await canvasStats(page);
  expect(stats.distinct).toBeGreaterThan(30);
});
