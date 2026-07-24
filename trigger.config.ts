import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Find this in your Trigger.dev dashboard: Project settings -> Project ref (starts with "proj_")
  project: "proj_iktavqfxuwhqstnphrtl",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  dirs: ["./src/trigger"],
});
