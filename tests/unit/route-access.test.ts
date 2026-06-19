import { describe, expect, it } from "vitest";

import {
  getDefaultRouteForRole,
  isPublicRoute,
  isRouteAllowedForRole,
} from "@/lib/auth/route-access";

describe("route access", () => {
  it("recognizes authentication routes as public", () => {
    expect(isPublicRoute("/auth/login")).toBe(true);
    expect(isPublicRoute("/auth/register")).toBe(true);
    expect(isPublicRoute("/auth/callback")).toBe(true);
    expect(isPublicRoute("/today")).toBe(false);
  });

  it("keeps staff out of manager workspaces", () => {
    expect(isRouteAllowedForRole("/today", "staff")).toBe(false);
    expect(isRouteAllowedForRole("/receive", "staff")).toBe(true);
    expect(isRouteAllowedForRole("/receiving/review", "staff")).toBe(false);
    expect(isRouteAllowedForRole("/invoices/upload", "staff")).toBe(false);
    expect(isRouteAllowedForRole("/recipes/mappings", "staff")).toBe(false);
    expect(isRouteAllowedForRole("/production", "staff")).toBe(true);
  });

  it("allows managers into receiving review and invoice workflows", () => {
    expect(isRouteAllowedForRole("/receiving/review", "manager")).toBe(true);
    expect(isRouteAllowedForRole("/invoices/upload", "manager")).toBe(true);
    expect(isRouteAllowedForRole("/recipes/theoretical-usage", "manager")).toBe(
      true,
    );
  });

  it("sends each role to its primary workspace", () => {
    expect(getDefaultRouteForRole("manager")).toBe("/today");
    expect(getDefaultRouteForRole("staff")).toBe("/receive");
  });
});
