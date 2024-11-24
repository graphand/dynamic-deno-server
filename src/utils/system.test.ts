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

// Additional runCommand tests
Deno.test("runCommand - command with stderr output", async () => {
  await assertRejects(
    async () => {
      // On Unix-like systems, this command produces stderr output
      await runCommand(["ls", "/nonexistent"]);
    },
    Error,
    "Command failed",
  );
});

Deno.test("runCommand - command with spaces in arguments", async () => {
  const result = await runCommand(["echo", "hello world"]);
  assertEquals(result.trim(), "hello world");
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

// Additional isDirectory tests
Deno.test("isDirectory - file path instead of directory", async () => {
  const tempFile = await Deno.makeTempFile();
  try {
    const result = await isDirectory(tempFile);
    assertEquals(result, false);
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("isDirectory - symlink to directory", async () => {
  const tempDir = await Deno.makeTempDir();
  const symlinkPath = `${tempDir}_link`;
  try {
    await Deno.symlink(tempDir, symlinkPath);
    const result = await isDirectory(symlinkPath);
    assertEquals(result, true);
  } finally {
    await Deno.remove(symlinkPath);
    await Deno.remove(tempDir);
  }
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

// Additional isFile tests
Deno.test("isFile - directory path instead of file", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const result = await isFile(tempDir);
    assertEquals(result, false);
  } finally {
    await Deno.remove(tempDir);
  }
});

Deno.test("isFile - symlink to file", async () => {
  const tempFile = await Deno.makeTempFile();
  const symlinkPath = `${tempFile}_link`;
  try {
    await Deno.symlink(tempFile, symlinkPath);
    const result = await isFile(symlinkPath);
    assertEquals(result, true);
  } finally {
    await Deno.remove(symlinkPath);
    await Deno.remove(tempFile);
  }
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
