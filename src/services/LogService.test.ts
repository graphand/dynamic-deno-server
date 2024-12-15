import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.200.0/testing/bdd.ts";
import { LogService } from "./LogService.ts";
import { resolve } from "https://deno.land/std/path/mod.ts";

describe("LogService", () => {
  const testLogsDir = "./.tmp/test_logs";
  const testServerName = "test_server";
  let logService: LogService;

  beforeEach(() => {
    logService = new LogService(testLogsDir);
  });

  afterEach(async () => {
    await logService.close();
    try {
      await Deno.remove(testLogsDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("initializeLogFile", () => {
    it("should create logs directory and initialize log file", async () => {
      await logService.initializeLogFile(testServerName);

      const logPath = resolve(testLogsDir, `${testServerName}.log`);
      const fileInfo = await Deno.stat(logPath);

      assertExists(fileInfo);
      assertEquals(fileInfo.isFile, true);
    });

    it("should create empty log file", async () => {
      await logService.initializeLogFile(testServerName);

      const logPath = resolve(testLogsDir, `${testServerName}.log`);
      const content = await Deno.readTextFile(logPath);

      assertEquals(content, "");
    });
  });

  describe("setupProcessLogging", () => {
    it("should throw error if log stream is not initialized", async () => {
      const mockProcess = {
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
      } as unknown as Deno.ChildProcess;

      await assertRejects(
        () => logService.setupProcessLogging(mockProcess),
        Error,
        "Log stream not initialized",
      );
    });

    it("should log stdout and stderr with correct format", async () => {
      await logService.initializeLogFile(testServerName);

      // Create mock process with controlled output
      const encoder = new TextEncoder();
      const stdout = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("test stdout\n"));
          controller.close();
        },
      });
      const stderr = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("test stderr\n"));
          controller.close();
        },
      });

      const mockProcess = {
        stdout,
        stderr,
      } as unknown as Deno.ChildProcess;

      await logService.setupProcessLogging(mockProcess);

      // Give some time for the async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Read the log file
      const logPath = resolve(testLogsDir, `${testServerName}.log`);
      const content = await Deno.readTextFile(logPath);
      const lines = content.split("\n").filter(line => line.length > 0);

      // Verify log format
      assertEquals(lines.length, 2);
      assert(lines[0].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z stdout F test stdout$/));
      assert(lines[1].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z stderr F test stderr$/));
    });
  });

  describe("close", () => {
    it("should close log stream and file", async () => {
      await logService.initializeLogFile(testServerName);
      await logService.close();

      // Attempting to use the closed stream should throw
      const mockProcess = {
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
      } as unknown as Deno.ChildProcess;

      await assertRejects(
        () => logService.setupProcessLogging(mockProcess),
        Error,
        "Log stream not initialized",
      );
    });

    it("should handle multiple close calls gracefully", async () => {
      await logService.initializeLogFile(testServerName);
      await logService.close();
      await logService.close(); // Should not throw
    });
  });

  describe("setupProcessLogging with Docker format", () => {
    it("should log stdout and stderr in Docker JSON format", async () => {
      logService = new LogService(testLogsDir, "docker");
      await logService.initializeLogFile(testServerName);

      // Create mock process with controlled output
      const encoder = new TextEncoder();
      const stdout = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("test stdout\n"));
          controller.close();
        },
      });
      const stderr = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("test stderr\n"));
          controller.close();
        },
      });

      const mockProcess = {
        stdout,
        stderr,
      } as unknown as Deno.ChildProcess;

      await logService.setupProcessLogging(mockProcess);

      // Read the log file
      const logPath = resolve(testLogsDir, `${testServerName}.log`);
      const content = await Deno.readTextFile(logPath);
      const lines = content.split("\n").filter(line => line.length > 0);

      // Verify log format
      assertEquals(lines.length, 2);
      assert(JSON.parse(lines[0]).log === "test stdout\n");
      assert(JSON.parse(lines[1]).log === "test stderr\n");
    });
  });

  it("should handle multiline logs correctly in CRI format", async () => {
    await logService.initializeLogFile(testServerName);

    const encoder = new TextEncoder();
    const multilineText = '{\n  "key": "value",\n  "another": "value"\n}';
    const stdout = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(multilineText));
        controller.close();
      },
    });

    const mockProcess = {
      stdout,
      stderr: new ReadableStream(),
    } as unknown as Deno.ChildProcess;

    // Setup logging
    await logService.setupProcessLogging(mockProcess);

    // Add a small delay to ensure all streams are processed
    await new Promise(resolve => setTimeout(resolve, 100));

    const logPath = resolve(testLogsDir, `${testServerName}.log`);
    const content = await Deno.readTextFile(logPath);
    const lines = content.split("\n").filter(line => line.length > 0);

    assertEquals(lines.length, 4);
    assert(lines[0].endsWith("stdout F {"));
    assert(lines[1].endsWith('stdout F   "key": "value",'));
    assert(lines[2].endsWith('stdout F   "another": "value"'));
    assert(lines[3].endsWith("stdout F }"));
  });
});
