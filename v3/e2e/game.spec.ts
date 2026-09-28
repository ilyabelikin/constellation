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
  await expect(page.locator("#topbar .res.credits")).toContainText("135"); // 250 − 95 (hub) − 20 (corvette)

  // Run time forward; the building completes (about a month) and the log says so.
  await page.evaluate(() => (window as any).__app.game.advance(36));
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
  // Rivals we haven't met are unknown and can't be addressed.
  await expect(page.locator(".empire-card", { hasText: "Unknown civilization" })).not.toHaveCount(0);
  await expect(page.locator('.empire-card [data-action^="war:"]')).toHaveCount(0);
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    const rival = Object.values(g.state.empires).find((e: any) => e.id !== g.playerId && !e.isPirate) as any;
    (g.player.contacts ??= {})[rival.id] = true;
    (rival.contacts ??= {})[g.playerId] = true;
  });
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
  await expect(page.locator(".toast.good").last()).toContainText("build Solar Array");
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

test("system outline and opportunity badges help explore quickly", async ({ page }) => {
  await startGame(page, "hero7");
  await page.click('[data-action="speed:0"]');
  // The outline lists the star, the homeworld and tunnel gates.
  await expect(page.locator("#outliner .tabs button.active")).toContainText("System");
  await expect(page.locator("#outliner")).toContainText("Terran World");
  await expect(page.locator("#outliner")).toContainText("Tunnels");
  // Clicking a row selects that body.
  const row = page.locator("#outliner .orow", { hasText: "Gas Giant" }).first();
  await row.click();
  await expect(page.locator("#details .subtitle")).toContainText("Gas Giant");
  // Badges show recommended actions; the energy badge jumps to an energy site.
  await expect(page.locator('#badges [data-action="badge:energy"]')).toBeVisible();
  await page.click('#badges [data-action="badge:energy"]');
  await expect(page.locator("#details")).toContainText(/Solar Array|Gas Harvester/);
  // Empire tab still lists colonies and fleets.
  await page.click('[data-action="tab:empire"]');
  await expect(page.locator("#outliner")).toContainText("Colonies");
});

test("right-click dismisses badges and messages", async ({ page }) => {
  await startGame(page, "hero7");
  await page.click('[data-action="speed:0"]');
  const mining = page.locator('#badges [data-action="badge:mining"]');
  await expect(mining).toBeVisible();
  await mining.click({ button: "right" });
  await expect(mining).toHaveCount(0);
  // Other badges are unaffected, and the dismissal survives re-renders.
  await expect(page.locator('#badges [data-action="badge:energy"]')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(mining).toHaveCount(0);
  // Toasts close on right-click.
  await page.evaluate(() => (window as any).__app.toast("Test message", "info"));
  const toast = page.locator(".toast", { hasText: "Test message" });
  await expect(toast).toBeVisible();
  await toast.click({ button: "right" });
  await expect(toast).toHaveCount(0);
});

test("colonize without a colony ship offers to build one at the best shipyard", async ({ page }) => {
  await startGame(page, "hero7");
  await page.click('[data-action="speed:0"]');
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.player.resources.credits = 5000;
    g.player.resources.metals = 5000;
  });
  // Pick a colonizable world via the opportunity badge instead of guessing.
  await page.click('#badges [data-action="badge:colonize"]');
  await page.locator('#details [data-action^="colonize:"]').click();
  await expect(page.locator(".modal h2")).toContainText("Colonize");
  await expect(page.locator(".modal .tag.peace")).toContainText("recommended");
  await page.locator('.modal [data-action^="buildcolony:"]').first().click();
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect(page.locator("#details")).toContainText("Colony ship being built");
});

test("colony ships park in orbit and send shuttles down instead of flying into the planet", async ({ page }) => {
  await startGame(page, "orbit-e2e");
  await page.click('[data-action="speed:0"]');
  const bodyId = await page.evaluate(() => {
    const app = (window as any).__app;
    const g = app.game;
    g.player.resources.credits = 5000;
    g.player.resources.metals = 5000;
    const cap = g.playerColonies()[0];
    const taken = new Set(Object.values(g.state.colonies).map((c: any) => c.bodyId));
    const hab = (window as any).__app.game.state.systems[cap.systemId].bodyIds
      .map((id: string) => g.state.bodies[id])
      .filter((b: any) => (b.kind === "planet" || b.kind === "moon") && !taken.has(b.id) && b.id !== cap.bodyId);
    // First world in the home system the player can settle.
    for (const b of hab) if (g.buildColonyShipFor(b.id, cap.id).ok) return b.id;
    return null;
  });
  expect(bodyId).not.toBeNull();
  await page.click('[data-action="speed:4"]');
  // Watch the approach: record how close the ship's visual gets to the planet centre.
  const result = await page.evaluate(
    (id) =>
      new Promise<{ minRatio: number; shuttles: number; colonized: boolean }>((resolve) => {
        const app = (window as any).__app;
        let minRatio = Infinity;
        let shuttles = 0;
        const started = performance.now();
        const tick = () => {
          const v = app.systemView;
          const s = app.game.state;
          const fleet = Object.values(s.fleets).find((f: any) => f.order?.kind === "colonize" && f.order.bodyId === id) as any;
          if (v && fleet && fleet.systemId === app.systemId) {
            const body = s.bodies[id];
            const center = v.bodyWorld(body);
            const pos = v.fleetWorld(fleet);
            if (fleet.order.route.length === 0) minRatio = Math.min(minRatio, pos.distanceTo(center) / v.bodyRadius(id));
            shuttles = Math.max(shuttles, v.shuttles.count);
          }
          const colonized = Object.values(s.colonies).some((c: any) => c.bodyId === id);
          if (colonized || performance.now() - started > 150_000) resolve({ minRatio, shuttles, colonized });
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    bodyId,
  );
  expect(result.colonized).toBe(true);
  expect(result.minRatio).toBeGreaterThan(1.3); // never inside (or skimming) the planet
  expect(result.shuttles).toBeGreaterThan(0);
});

test("double-clicking a gate flies the camera through it into the connected system", async ({ page }) => {
  await startGame(page, "gate-e2e");
  await page.click('[data-action="speed:0"]');
  const info = await page.evaluate(() => {
    const app = (window as any).__app;
    const sys = app.game.state.systems[app.systemId];
    const gate = sys.gates[0];
    app.game.player.explored[gate.otherSystemId] = true; // surveyed earlier
    // Frame the gate so it can be double-clicked.
    const p = app.systemView.gateWorld(gate.tunnelId);
    app.select(null);
    app.engine.rig.follow = null;
    app.engine.rig.focus(p, 40);
    app.engine.rig.snap();
    return { from: app.systemId, to: gate.otherSystemId, tunnelId: gate.tunnelId };
  });
  // Wait for the camera to settle on the gate, then double-click it.
  let pos: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      pos = await page.evaluate((id) => {
        const app = (window as any).__app;
        const p = app.engine.project(app.systemView.gateWorld(id));
        const hit = p && app.engine.pick(p.x, p.y);
        const onScreen = p && p.x > 100 && p.x < innerWidth - 100 && p.y > 100 && p.y < innerHeight - 100;
        return onScreen && hit?.kind === "gate" && hit.id === id ? p : null;
      }, info.tunnelId);
      return pos;
    })
    .not.toBeNull();
  await page.mouse.dblclick(pos!.x, pos!.y);
  await expect.poll(() => page.evaluate(() => (window as any).__app.gateJump?.phase ?? (window as any).__app.systemId)).not.toBe(info.from);
  const shots = process.env.GATE_SHOTS;
  for (let i = 0; i < 6 && shots; i++) {
    await page.screenshot({ path: `${shots}/gate-${i}.png` });
    await page.waitForTimeout(450);
  }
  await expect.poll(() => page.evaluate(() => (window as any).__app.systemId)).toBe(info.to);
  await expect.poll(() => page.evaluate(() => (window as any).__app.gateJump), { timeout: 30_000 }).toBeNull();
  const fov = await page.evaluate(() => (window as any).__app.engine.camera.fov);
  expect(fov).toBeCloseTo(50, 3);
  if (shots) await page.screenshot({ path: `${shots}/gate-end.png` });
});

test("unsurveyed systems cannot be entered or looked into", async ({ page }) => {
  await startGame(page, "gate-e2e");
  await page.click('[data-action="speed:0"]');
  const r = await page.evaluate(() => {
    const app = (window as any).__app;
    const g = app.game;
    const unknown = Object.keys(g.state.systems).find((id) => !g.player.explored[id])!;
    const before = app.systemId;
    app.enterSystem(unknown);
    const gate = g.state.systems[before].gates.find((x: any) => !g.player.explored[x.otherSystemId]);
    if (gate) app.jumpThroughGate(gate.tunnelId);
    return { before, after: app.systemId, jumping: !!app.gateJump };
  });
  expect(r.after).toBe(r.before);
  expect(r.jumping).toBe(false);
  await expect(page.locator(".toast.error").first()).toContainText("Unsurveyed");
});

test("HUD updates don't recreate hovered buttons, and one click builds", async ({ page }) => {
  await startGame(page, "hud-stable");
  await page.click('[data-action="speed:4"]');
  const cap = await page.evaluate(() => {
    const app = (window as any).__app;
    const c = app.game.playerColonies().find((x: any) => x.capital);
    app.game.player.resources.credits = 9000;
    app.game.player.resources.metals = 9000;
    app.game.queueBuilding(c.id, "mine"); // something in progress so the panel keeps changing
    app.select({ kind: "body", id: c.bodyId });
    return c.id;
  });
  const btn = page.locator('#details [data-action^="build:"]:not([disabled])').first();
  await expect(btn).toBeVisible();
  await btn.hover();
  await page.evaluate(() => ((document.querySelector('#details [data-action^="build:"]:not([disabled])') as any).__marker = 1));
  const q0 = await page.evaluate((id) => (window as any).__app.game.state.colonies[id].queue.length, cap);
  await page.waitForTimeout(2500); // many HUD refreshes while the queue progresses
  const stable = await page.evaluate(() => (document.querySelector('#details [data-action^="build:"]:not([disabled])') as any)?.__marker === 1);
  expect(stable).toBe(true);
  await btn.click();
  await expect.poll(() => page.evaluate((id) => (window as any).__app.game.state.colonies[id].queue.length, cap)).toBe(q0 + 1);
});

test("species screen shows a turntable of that civilization's ships", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#lb-ship canvas")).toBeVisible();
  await page.click('[data-species="kraal"]');
  await expect(page.locator(".ship-preview-caption")).toContainText("Kraal");
  await expect(page.locator(".ship-preview-caption")).toContainText("bio-carapace");
  const lit = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const src = document.querySelector("#lb-ship canvas") as HTMLCanvasElement;
          const c = document.createElement("canvas");
          c.width = 120;
          c.height = 50;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(src, 0, 0, 120, 50);
          const d = ctx.getImageData(0, 0, 120, 50).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) n++;
          resolve(n);
        }),
      ),
  );
  expect(lit).toBeGreaterThan(30); // a ship is actually drawn
  await page.click('[data-species="aurelian"]');
  await expect(page.locator(".ship-preview-caption")).toContainText("Aurelian");
  // Starting the game tears the preview down.
  await page.click("#lb-start");
  await expect(page.locator("#topbar")).toBeVisible();
  await expect(page.locator("#lb-ship")).toHaveCount(0);
});

test("creation effects ride along with the object that moves on its orbit", async ({ page }) => {
  await startGame(page, "follow-fx");
  await page.click('[data-action="speed:4"]');
  const r = await page.evaluate(
    () =>
      new Promise<{ moved: number; lag: number }>((resolve) => {
        const app = (window as any).__app;
        const v = app.systemView;
        const s = app.game.state;
        // The fastest-moving planet in the home system.
        const planet = s.systems[app.systemId].bodyIds.map((id: string) => s.bodies[id]).filter((b: any) => b.kind === "planet").sort((a: any, b: any) => a.orbit.period - b.orbit.period)[0];
        const start = v.bodyWorld(planet).clone();
        v.handleEvents([{ type: "colonized", systemId: app.systemId, bodyId: planet.id, empireId: s.playerId }]);
        const fx = v.effects.effects[v.effects.effects.length - 1];
        setTimeout(() => {
          const now = v.bodyWorld(planet);
          resolve({ moved: now.distanceTo(start), lag: fx.obj.position.distanceTo(now) });
        }, 1200);
      }),
  );
  expect(r.moved).toBeGreaterThan(0.05); // the planet really moved…
  expect(r.lag).toBeLessThan(0.05); // …and the pulse moved with it
});

test("fleets are renamed in place from the pencil next to their name", async ({ page }) => {
  await startGame(page, "rename-e2e");
  await page.click('[data-action="speed:0"]');
  const id = await page.evaluate(() => {
    const app = (window as any).__app;
    const f = Object.values(app.game.state.fleets).find((x: any) => x.empireId === app.game.playerId && x.name === "Home Guard") as any;
    app.select({ kind: "fleet", id: f.id });
    return f.id;
  });
  await page.locator(`#details .fleet-name [data-action="rename:${id}"]`).click();
  const input = page.locator("#rename-input");
  await expect(input).toBeFocused();
  await input.fill("Iron Wall");
  await page.keyboard.press("Enter");
  await expect(page.locator("#details .fleet-name")).toContainText("Iron Wall");
  expect(await page.evaluate((fid) => (window as any).__app.game.state.fleets[fid].name, id)).toBe("Iron Wall");
  // Escape cancels; typing doesn't trigger hotkeys (G would open the galaxy map).
  await page.locator(`#details .fleet-name [data-action="rename:${id}"]`).click();
  await input.fill("Gggg");
  await page.keyboard.press("Escape");
  await expect(page.locator("#details .fleet-name")).toContainText("Iron Wall");
  expect(await page.evaluate(() => (window as any).__app.view)).toBe("system");
  await expect(page.locator('#details [data-action^="rename:"]:has-text("Rename")')).toHaveCount(0);
});

test("stations being built or queued show progress in the body panel, like a colony queue", async ({ page }) => {
  await startGame(page, "station-queue");
  await page.click('[data-action="speed:0"]');
  const ids = await page.evaluate(() => {
    const app = (window as any).__app;
    const g = app.game;
    g.player.resources.credits = 9000;
    g.player.resources.metals = 9000;
    const b = Object.values(g.state.fleets).find((f: any) => f.empireId === g.playerId && f.ships.some((s: any) => s.hull === "constructor")) as any;
    const sys = g.state.systems[app.systemId];
    const sites: [string, string][] = [];
    for (const id of sys.bodyIds)
      for (const st of ["mining_station", "gas_harvester", "research_station"])
        if (sites.length < 2 && !sites.some(([x]) => x === id) && g.buildStation(b.id, id, st, sites.length > 0).ok) sites.push([id, st]);
    return { builder: b.id, first: sites[0][0], second: sites[1][0] };
  });
  // The queued job appears on its body with a cancel button.
  await page.evaluate((id) => (window as any).__app.select({ kind: "body", id }), ids.second);
  await expect(page.locator("#details .section-title", { hasText: "Station construction" })).toBeVisible();
  await expect(page.locator("#details .queue-item")).toContainText("queued");
  // The active job shows travel, then progress.
  await page.evaluate((id) => (window as any).__app.select({ kind: "body", id }), ids.first);
  await expect(page.locator("#details .queue-item")).toHaveCount(1);
  await page.evaluate(() => (window as any).__app.game.advance(40));
  await expect
    .poll(() => page.evaluate(() => (document.querySelector("#details .queue-item .bar > div") as HTMLElement | null)?.style.width ?? "none"))
    .not.toBe("0%");
  // Cancelling the queued job removes it from the constructor's plan.
  await page.evaluate((id) => (window as any).__app.select({ kind: "body", id }), ids.second);
  await page.locator('#details .queue-item [data-action^="cancelorder:"]').click();
  await expect(page.locator("#details .queue-item")).toHaveCount(0);
  expect(await page.evaluate((id) => (window as any).__app.game.state.fleets[id].queue.length, ids.builder)).toBe(0);
});

test("clicking a log entry locates what it is about, or where it was last seen", async ({ page }) => {
  await startGame(page, "log-locate");
  await page.click('[data-action="speed:0"]');
  const ids = await page.evaluate(() => {
    const app = (window as any).__app;
    const s = app.game.state;
    const guard = Object.values(s.fleets).find((f: any) => f.empireId === s.playerId && f.name === "Home Guard") as any;
    const unexplored = Object.keys(s.systems).find((id) => !s.empires[s.playerId].explored[id])!;
    const day = s.day;
    s.log.push(
      { day, kind: "info", text: "LOC-A our guard", empireId: s.playerId, ref: { kind: "fleet", id: guard.id, systemId: guard.systemId, pos: guard.pos } },
      { day, kind: "danger", text: "LOC-B raiders spotted", empireId: s.playerId, systemId: app.systemId, ref: { kind: "fleet", id: "f-gone", systemId: app.systemId, pos: { x: 3, y: 0, z: 1 } } },
      { day, kind: "danger", text: "LOC-C far away", empireId: s.playerId, systemId: unexplored, ref: { kind: "fleet", id: "f-far", systemId: unexplored, pos: { x: 1, y: 0, z: 0 } } },
    );
    app.select(null);
    return { guard: guard.id, unexplored };
  });
  // A fleet we can see: selected.
  await page.locator("#log .log-entry", { hasText: "LOC-A" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__app.selection?.id)).toBe(ids.guard);
  // Gone from sight: the camera flies to where it was last seen, and says so.
  await page.locator("#log .log-entry", { hasText: "LOC-B" }).click();
  await expect(page.locator(".toast").last()).toContainText("Last seen");
  const target = await page.evaluate(() => {
    const a = (window as any).__app;
    const m = a.systemView.layout.map({ x: 3, y: 0, z: 1 });
    const t = a.engine.rig.goalTarget;
    return Math.hypot(t.x - m.x, t.y - m.y, t.z - m.z);
  });
  expect(target).toBeLessThan(0.01);
  // In a system we have not surveyed: shown on the galaxy map instead.
  await page.locator("#log .log-entry", { hasText: "LOC-C" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__app.view)).toBe("galaxy");
  await expect.poll(() => page.evaluate(() => (window as any).__app.selection?.id)).toBe(ids.unexplored);
});
