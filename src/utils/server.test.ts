import { assertRejects } from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { validateCode, pollDirectory } from "./server.ts";
import { describe, it } from "https://deno.land/std@0.200.0/testing/bdd.ts";

describe("validateCode", () => {
  it("should pass for valid code", async () => {
    // Create temporary test directory with valid code
    const testDir = await Deno.makeTempDir();
    await Deno.writeTextFile(
      `${testDir}/index.ts`,
      `
      console.log("Hello World");
    `,
    );

    await validateCode(testDir);
    await Deno.remove(testDir, { recursive: true });
  });

  it("should throw error for invalid code", async () => {
    // Create temporary test directory with invalid code
    const testDir = await Deno.makeTempDir();
    await Deno.writeTextFile(
      `${testDir}/index.ts`,
      `
      const x: string = 123; // Type error
    `,
    );

    await assertRejects(() => validateCode(testDir), Error);
    await Deno.remove(testDir, { recursive: true });
  });
});

describe("pollDirectory", () => {
  it("should throw error when directory doesn't exist", async () => {
    const nonExistentDir = "/tmp/non-existent-dir-" + Math.random();

    await assertRejects(() => pollDirectory(nonExistentDir, 100), Error);
  });

  it("should continue polling when directory exists", async () => {
    const testDir = await Deno.makeTempDir();

    // Start polling in background
    const pollPromise = pollDirectory(testDir, 100);

    // Wait briefly to ensure polling started
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cleanup
    await Deno.remove(testDir);

    // Ensure polling stops after directory removal
    await assertRejects(() => pollPromise, Error);
  });
});
