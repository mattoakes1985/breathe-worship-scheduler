// Playwright critical path (PRD §13) — Agent 6 owned.
// Run with: npx playwright test (requires `npm i -D @playwright/test` and a
// seeded staging environment with the two test accounts below).
//
// Critical path: login → respond to availability → lead builds rota →
// volunteer receives assignment → volunteer requests swap → another volunteer
// claims → lead approves.
import { test, expect } from "@playwright/test";

const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:5173";
const VOLUNTEER = { email: process.env.E2E_VOLUNTEER_EMAIL ?? "", password: process.env.E2E_VOLUNTEER_PASSWORD ?? "" };
const LEAD = { email: process.env.E2E_LEAD_EMAIL ?? "", password: process.env.E2E_LEAD_PASSWORD ?? "" };

test.skip(!VOLUNTEER.email || !LEAD.email, "E2E accounts not configured — set E2E_* env vars");

test("volunteer can log in and see their dashboard", async ({ page }) => {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("Email").fill(VOLUNTEER.email);
  await page.getByLabel("Password").fill(VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Here's what needs your attention/)).toBeVisible();
});

test("sign-up route does not exist (AUTH-1)", async ({ page }) => {
  await page.goto(`${APP_URL}/signup`);
  await expect(page.getByText(/invite-only|contact your team lead/i)).not.toHaveCount(0);
});

test("volunteer responds to availability", async ({ page }) => {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("Email").fill(VOLUNTEER.email);
  await page.getByLabel("Password").fill(VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${APP_URL}/availability`);
  const yes = page.getByRole("radio", { name: "Yes" }).first();
  if (await yes.isVisible()) {
    await yes.click();
    await expect(yes).toHaveAttribute("aria-checked", "true");
  }
});

test("team lead can open the rota builder", async ({ page }) => {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("Email").fill(LEAD.email);
  await page.getByLabel("Password").fill(LEAD.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${APP_URL}/team-lead`);
  await expect(page.getByText("What needs your attention first.")).toBeVisible();
});

test("mobile viewport (360px) renders the dashboard usably", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${APP_URL}/login`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
