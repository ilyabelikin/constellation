import { expect, test, type Page } from "@playwright/test";

// Two players in separate browser contexts (separate identities) play one
// server-hosted galaxy. The game server runs with an in-memory database.

const errors: string[] = [];

function watch(page: Page, who: string) {
  page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("ERR_CERT") && !m.text().includes("fonts.g")) errors.push(`${who}: ${m.text()}`);
  });
}

async function openLobby(page: Page, name: string, path = "/") {
  await page.goto(path);
  await expect(page.locator(".title").first()).toBeVisible();
  if (path === "/") {
    await expect(page.locator("#lb-host")).toBeVisible();
    await page.fill("#lb-player", name);
    await page.locator("#lb-player").dispatchEvent("change");
  }
}

/** The HUD re-renders several times a second, so click through the DOM directly. */
async function domClick(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toBeVisible();
  await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).click(), selector);
}

test.beforeEach(() => {
  errors.length = 0;
});

test.afterEach(() => {
  expect(errors, errors.join("\n")).toEqual([]);
});

test("host a galaxy, a friend joins by link, takes a seat and both play", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  watch(host, "host");
  watch(guest, "guest");

  await openLobby(host, "Alice");
  await host.fill("#lb-seed", "mp-e2e");
  await host.click("#lb-host");
  const code = (await host.locator("#room-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await expect(host.locator(".seat.mine")).toContainText("Alice");

  // The guest follows the invite link and lands in the waiting room.
  await guest.goto(`/?join=${code}`);
  await expect(guest.locator("#room-code")).toHaveText(code);
  await expect(guest.locator("#room-start")).toHaveCount(0); // only the host starts
  await guest.locator('.seat button:has-text("Take seat")').first().click();
  await expect(guest.locator(".seat.mine")).toBeVisible();
  await expect(host.locator(".seat").filter({ hasText: "○" }).or(host.locator(".seat").filter({ hasText: "●" }))).toHaveCount(2);

  await host.click("#room-start");
  await expect(host.locator("#topbar")).toBeVisible();
  await expect(guest.locator("#topbar")).toBeVisible();
  await expect(host.locator("#lobby")).toBeHidden();
  await expect(guest.locator("#lobby")).toBeHidden();

  // Each sees their own empire, and both are shown as online players.
  const hostEmpire = await host.evaluate(() => (window as any).__app.game.playerId);
  const guestEmpire = await guest.evaluate(() => (window as any).__app.game.playerId);
  expect(hostEmpire).not.toBe(guestEmpire);
  await expect(host.locator("#topbar .online")).toContainText("2/2");

  // The shared clock runs; only the host may change the speed.
  const day0 = await guest.evaluate(() => (window as any).__app.game.state.day);
  await expect.poll(() => guest.evaluate(() => (window as any).__app.game.state.day), { timeout: 20_000 }).toBeGreaterThan(day0 + 0.5);
  await expect(guest.locator('#topbar [data-action="speed:3"]')).toBeDisabled();
  await domClick(host, '#topbar [data-action="speed:3"]');
  await expect.poll(() => guest.evaluate(() => (window as any).__app.speedIndex)).toBe(3);

  // Anyone may pause.
  await domClick(guest, '#topbar [data-action="speed:0"]');
  await expect.poll(() => host.evaluate(() => (window as any).__app.paused)).toBe(true);
  await domClick(host, '#topbar [data-action="speed:1"]');

  // Commands go through the server: the guest queues a scout at their capital.
  const queued = await guest.evaluate(() => {
    const app = (window as any).__app;
    const cap = app.game.playerColonies().find((c: any) => c.capital);
    app.game.queueShip(cap.id, "scout");
    return cap.id;
  });
  await expect
    .poll(() => guest.evaluate((id) => (window as any).__app.game.state.colonies[id].queue.some((q: any) => q.type === "scout"), queued))
    .toBe(true);

  // Fog of war: the guest does not know the host's empire yet.
  const hostName = await guest.evaluate((id) => (window as any).__app.game.state.empires[id].name, hostEmpire);
  expect(hostName).toBe("Unknown civilization");

  // Leaving returns to the title; the game keeps its seat for later.
  await domClick(guest, '#topbar [data-action="modal:menu"]');
  await domClick(guest, '[data-action="quit"]');
  await expect(guest.locator("#lb-host")).toBeVisible();
  await expect(guest.locator(".lobby-row")).toContainText("Resume");
  await expect(host.locator("#topbar .online")).toContainText("1/2");

  // Resume puts the guest straight back into their empire.
  await guest.locator('.lobby-row button:has-text("Resume")').click();
  await expect(guest.locator("#topbar")).toBeVisible();
  expect(await guest.evaluate(() => (window as any).__app.game.playerId)).toBe(guestEmpire);

  await hostCtx.close();
  await guestCtx.close();
});

test("cloud saves: save a local game and load it after a reload", async ({ page }) => {
  watch(page, "player");
  await openLobby(page, "Carol");
  await page.fill("#lb-seed", "cloud-e2e");
  await page.click("#lb-start");
  await expect(page.locator("#topbar")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__app.game.state.day)).toBeGreaterThan(2);
  await domClick(page, '#topbar [data-action="modal:menu"]');
  await domClick(page, '[data-action="cloudsave"]');
  await expect(page.locator(".toast.good").filter({ hasText: "cloud" })).toBeVisible();
  const day = await page.evaluate(() => (window as any).__app.game.state.day);

  await page.reload();
  await expect(page.locator(".lobby-row").filter({ hasText: "day" }).first()).toBeVisible();
  await page.locator('.lobby-row button:has-text("Load")').first().click();
  await expect(page.locator("#topbar")).toBeVisible();
  const loaded = await page.evaluate(() => (window as any).__app.game.state.day);
  expect(loaded).toBeGreaterThanOrEqual(Math.floor(day) - 0.01);
  expect(await page.evaluate(() => (window as any).__app.game.state.settings.seed)).toBe("cloud-e2e");
});

test("talk to a rival ruler: the game pauses while you write and they answer in character", async ({ page }) => {
  watch(page, "player");
  await openLobby(page, "Dana");
  await expect(page.locator('#lb-online .tag:has-text("AI diplomats")')).toBeVisible();
  await page.fill("#lb-seed", "talk-e2e");
  await page.click("#lb-start");
  await expect(page.locator("#topbar")).toBeVisible();
  const rival = await page.evaluate(() => {
    const g = (window as any).__app.game;
    const e = Object.values(g.state.empires).find((x: any) => x.ai && !x.isPirate) as any;
    (g.player.contacts ??= {})[e.id] = true;
    (e.contacts ??= {})[g.playerId] = true;
    return { id: e.id, name: e.name };
  });
  await domClick(page, '#topbar [data-action="modal:empires"]');
  await domClick(page, `[data-action="chat:${rival.id}"]`);
  await expect(page.locator(".modal h2")).toHaveText(rival.name);
  await expect.poll(() => page.evaluate(() => (window as any).__app.paused)).toBe(true);
  await page.fill("#chat-input", "Greetings! Would you accept a gift as tribute?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".chat-msg.ours")).toContainText("Greetings!");
  await expect(page.locator(".chat-msg:not(.ours)")).toContainText("acknowledges", { timeout: 20_000 });
  await expect(page.locator(".chat-msg:not(.ours) .meta")).toContainText("sent 50 credits");
  await domClick(page, '.modal [data-action="close"]');
  await expect.poll(() => page.evaluate(() => (window as any).__app.paused)).toBe(false);
  // The correspondence is part of the saved game.
  expect(await page.evaluate(() => (window as any).__app.local.state.chats.length)).toBe(2);
});
