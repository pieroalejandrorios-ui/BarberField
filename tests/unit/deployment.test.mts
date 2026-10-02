import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentEnvironment, deploymentIssues } from "../../src/lib/deployment.ts";

const config = {
  APP_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
const production = {
  ...config, APP_ENV: "production", NEXT_PUBLIC_APP_URL: "https://barberia.example",
  SUPABASE_PRODUCTION_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa",
};

test("la configuración local funciona y la publicación exige destino de producción", () => {
  assert.deepEqual(deploymentIssues(config), []);
  assert(deploymentIssues(config, true).length > 0);
  assert.deepEqual(deploymentIssues(production, true), []);
  assert(deploymentIssues({ ...production, SUPABASE_PRODUCTION_PROJECT_REF: undefined }, true).length > 0);
});
test("Preview prevalece sobre un override y detecta el uso de Supabase de producción", () => {
  const env = { ...production, VERCEL_ENV: "preview" };
  assert.equal(deploymentEnvironment(env), "preview");
  assert(deploymentIssues(env).some(issue => issue.includes("no coincide")));
  assert(deploymentIssues(env).some(issue => issue.includes("no deben conectarse")));
  assert.deepEqual(deploymentIssues({ ...production, APP_ENV: "preview", VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co" }), []);
});
test("rechaza dominios de producción locales, URL con credenciales y destinos erróneos", () => {
  for (const url of ["http://localhost:3000", "https://localhost", "https://user:pass@example.com", "https://example.com/panel", "https://example.com?token=x"]) {
    assert(deploymentIssues({ ...production, NEXT_PUBLIC_APP_URL: url }).length > 0, url);
  }
  assert(deploymentIssues({ ...production, NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co" }).length > 0);
  assert(deploymentIssues({ ...config, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" }).length > 0);
});
test("acepta claves públicas heredadas y rechaza claves secretas sin exponerlas", () => {
  const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.deepEqual(deploymentIssues({ ...config, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("anon") }), []);
  for (const key of ["", "sb_secret_fake", jwt("service_role"), "malformed.jwt.value"]) {
    const issues = deploymentIssues({ ...config, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
    assert(issues.some(issue => issue.includes("publishable")));
    if (key) assert(!issues.join(" ").includes(key));
  }
});
