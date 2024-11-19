import { assertEquals, assertRejects } from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { runCommand, isDirectory, isFile, normalizePath } from "./system.ts";
import { CONFIG } from "../config.ts";

// Test runCommand
Deno.test("runCommand - successful command", async () => {
  const result = await runCommand(["echo", "hello"]);
  assertEquals(result.trim(), "hello");
});

Deno.test("runCommand - failed command", async () => {
  await assertRejects(
    async () => {
      await runCommand(["nonexistentcommand"]);
    },
    Error,
    "Failed to run command",
  );
});

// Test isDirectory
Deno.test("isDirectory - existing directory", async () => {
  // Create temporary test directory
  const tempDir = await Deno.makeTempDir();
  try {
    const result = await isDirectory(tempDir);
    assertEquals(result, true);
  } finally {
    await Deno.remove(tempDir);
  }
});

Deno.test("isDirectory - non-existing path", async () => {
  const result = await isDirectory("/path/that/does/not/exist");
  assertEquals(result, false);
});

// Test isFile
Deno.test("isFile - existing file", async () => {
  // Create temporary test file
  const tempFile = await Deno.makeTempFile();
  try {
    const result = await isFile(tempFile);
    assertEquals(result, true);
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("isFile - non-existing file", async () => {
  const result = await isFile("/path/to/nonexistent/file.txt");
  assertEquals(result, false);
});

// Test normalizePath
Deno.test("normalizePath - valid function directory", async () => {
  // Create temporary test structure
  const tempDir = await Deno.makeTempDir();
  const funcDir = `${tempDir}/functions`;
  const testFuncDir = `${funcDir}/testFunc`;

  try {
    await Deno.mkdir(funcDir, { recursive: true });
    await Deno.mkdir(testFuncDir);
    await Deno.writeTextFile(`${testFuncDir}/index.ts`, "");

    // Temporarily override CONFIG.funcDirectory
    const originalFuncDir = CONFIG.funcDirectory;
    CONFIG.funcDirectory = funcDir;

    const result = await normalizePath(testFuncDir);
    assertEquals(result, "testFunc");

    // Restore original CONFIG
    CONFIG.funcDirectory = originalFuncDir;
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("normalizePath - invalid path", async () => {
  // Create temporary directory
  const tempDir = await Deno.makeTempDir(); // tempDir exists but is not in CONFIG.funcDirectory
  await assertRejects(() => normalizePath(tempDir), Error, "is not within");
});

Deno.test("normalizePath - missing index.ts", async () => {
  const tempDir = await Deno.makeTempDir();
  const funcDir = `${tempDir}/functions`;
  const testFuncDir = `${funcDir}/testFunc`;

  try {
    await Deno.mkdir(funcDir, { recursive: true });
    await Deno.mkdir(testFuncDir);

    // Temporarily override CONFIG.funcDirectory
    const originalFuncDir = CONFIG.funcDirectory;
    CONFIG.funcDirectory = funcDir;

    await assertRejects(
      async () => {
        await normalizePath(testFuncDir);
      },
      Error,
      "does not contain an index.ts file",
    );

    // Restore original CONFIG
    CONFIG.funcDirectory = originalFuncDir;
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
