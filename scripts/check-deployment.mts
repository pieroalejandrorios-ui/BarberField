import nextEnv from "@next/env";
import { deploymentEnvironment, deploymentIssues } from "../src/lib/deployment.ts";

nextEnv.loadEnvConfig(process.cwd());
const release = process.argv.includes("--production");
const issues = deploymentIssues(process.env, release);
if (issues.length) {
  console.error("La configuración necesita revisión:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Configuración válida para ${deploymentEnvironment(process.env)}. No se verificaron migraciones, respaldos ni un despliegue remoto.`);
}
