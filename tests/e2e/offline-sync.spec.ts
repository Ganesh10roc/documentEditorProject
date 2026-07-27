import { expect, test } from "@playwright/test";

/**
 * Offline-first end-to-end: the seeded owner signs in, edits a document while
 * the network is CUT (the UI must not block), then on reconnect the queued edit
 * flushes to the server and survives a reload — proving the local-first sync
 * engine reconciles without data loss.
 *
 * Note: the edit is made offline, but the reload happens ONLINE. The app is not
 * a PWA (no service-worker app-shell cache), so a full page reload legitimately
 * needs the network to fetch the shell; the local-first guarantee is that edits
 * never block on the network and reconcile on reconnect — which is what this
 * asserts. Prerequisites: app running + `npm run db:seed`.
 */
test("offline edits are non-blocking and reconcile on reconnect", async ({
  page,
  context,
}) => {
  // 1. Sign in as the seeded owner.
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@palimpsest.dev");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/documents");

  // 2. Open the seeded document and wait for the editor to be ready.
  await page
    .getByRole("link", { name: /Welcome to Palimpsest/i })
    .first()
    .click();
  await page.waitForURL(/\/documents\/.+/);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });

  // 3. Cut the network, then type. The UI must stay responsive.
  await context.setOffline(true);
  await editor.click();
  const marker = `sync-check-${Date.now()}`;
  await page.keyboard.type(` ${marker}`);
  await expect(editor).toContainText(marker);
  // Target the connection-status region specifically (role="status").
  await expect(page.getByRole("status")).toContainText(/Offline/i, {
    timeout: 10_000,
  });

  // 4. Reconnect — the queued local edit flushes to the server.
  await context.setOffline(false);
  await expect(page.getByRole("status")).toContainText(/All changes saved/i, {
    timeout: 25_000,
  });

  // 5. Reload (online) — the edit persisted (survived a fresh load).
  await page.reload();
  await expect(page.locator(".ProseMirror")).toContainText(marker, {
    timeout: 20_000,
  });
});
