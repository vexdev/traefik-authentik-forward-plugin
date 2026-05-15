import { Response, expect } from "@playwright/test";
import { StatusCodes } from "http-status-codes";

import { test } from "../fixtures";

test.describe("cache", () => {
  test.describe.configure({ mode: "serial" });

  test("should cache multiple requests", async ({
    sharedContextPage: page,
  }) => {
    // go to login page
    await page.goto("http://whoami-cache.localhost/login");

    // set redirect wait
    const responsePromise = page.waitForResponse(
      "http://whoami-cache.localhost/login",
      { timeout: 30000 },
    );

    // enter authentik username
    await page.waitForSelector(
      "ak-stage-identification input[name=uidField]",
    );
    await page.fill(
      "ak-stage-identification input[name=uidField]",
      "akadmin",
    );
    page.click("ak-stage-identification button[type=submit]");

    // enter authentik password
    await page.waitForSelector(
      "ak-stage-password input[name=password]",
    );
    page.fill(
      "ak-stage-password input[name=password]",
      "authentik",
    );
    page.click("ak-stage-password button[type=submit]");

    // wait for redirect
    const response = await responsePromise;
    await response.finished();

    // check for upstream
    expect(response.status()).toBe(StatusCodes.OK);

    // make multiple quick requests
    const responses = [];
    responses.push(await page.goto("http://whoami-cache.localhost"));
    responses.push(await page.goto("http://whoami-cache.localhost"));
    responses.push(await page.goto("http://whoami-cache.localhost"));

    // check for cached responses
    const cachedResponses = await Promise.all(
      responses
        .filter((response) => response !== null)
        .filter(async (response) => {
          const body = await response.text();
          return body.includes("X-Authentik-Traefik-Cached: true");
        }),
    );
    expect(cachedResponses.length).toBeGreaterThanOrEqual(2);
  });

  test("should clear cache after logout", async ({
    sharedContextPage: page,
  }) => {
    // go to main page
    const response = (await page.goto(
      "http://whoami-cache.localhost",
    )) as Response;

    // check for upstream
    expect(response.status()).toBe(StatusCodes.OK);
    expect(await page.content()).toContain("X-Authentik-Username: akadmin");

    // get cookies
    const cookies = await page.context().cookies();

    // go to logout page
    await page.goto(
      "http://whoami-cache.localhost/outpost.goauthentik.io/sign_out",
    );

    // wait for redirect
    await page.waitForURL("http://authentik.localhost:9000/**");

    // add cookies to context
    await page.context().addCookies(cookies);

    // go to allow page
    await page.goto("http://whoami-cache.localhost/allow");

    // check for not cached response
    expect(await page.content()).not.toContain("X-Authentik-Username");
    expect(await page.content()).toContain("X-Authentik-Traefik-Cached: false");

    // go again to allow page
    await page.goto("http://whoami-cache.localhost/allow");

    // check for cached response
    expect(await page.content()).not.toContain("X-Authentik-Username");
    expect(await page.content()).toContain("X-Authentik-Traefik-Cached: true");

    // go to deny page
    const denyResponse = (await page.goto(
      "http://whoami-cache.localhost/deny",
    )) as Response;

    // check for upstream
    expect(denyResponse.status()).toBe(StatusCodes.UNAUTHORIZED);
  });
});
