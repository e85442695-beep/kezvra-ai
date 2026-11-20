import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC = ["/", "/login", "/register", "/forgot-password", "/models", "/docs/api", "/help", "/status", "/legal/terms"];

test.describe("public pages", () => {
  for (const path of PUBLIC) {
    test(`${path} renders and has no serious a11y violations`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("h1").first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  test("app routes redirect anonymous users to login", async ({ page }) => {
    for (const path of ["/chat", "/billing", "/admin", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("keyboard: skip link is the first focusable element", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("href", "#main");
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});

test.describe("API protection", () => {
  test("rejects cross-origin mutations (CSRF)", async ({ request }) => {
    const res = await request.post("/api/chats", { headers: { origin: "https://evil.example" }, data: {} });
    expect(res.status()).toBe(403);
  });

  test("developer API requires a valid key", async ({ request }) => {
    const res = await request.post("/api/v1/chat/completions", { headers: { authorization: "Bearer kz_live_invalidinvalidinvalidinvalid" }, data: { model: "x", messages: [{ role: "user", content: "hi" }] } });
    expect(res.status()).toBe(401);
  });

  test("webhook rejects unsigned payloads", async ({ request }) => {
    const res = await request.post("/api/webhooks/stripe", { data: { id: "evt_fake" } });
    expect([400, 503]).toContain(res.status());
  });
});
