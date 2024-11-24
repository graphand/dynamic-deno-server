import { assertEquals } from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.200.0/testing/bdd.ts";
import { NamespaceService } from "./NamespaceService.ts";

describe("NamespaceService", () => {
  const testNamespace = "test_namespace";
  let namespaceService: NamespaceService;

  beforeEach(() => {
    namespaceService = new NamespaceService(testNamespace);
  });

  afterEach(async () => {
    try {
      await namespaceService.cleanup();
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe("generateNamespaceName", () => {
    it("should generate consistent namespace names", () => {
      const path = "/test/path";
      const expected = "ns_L3Rlc3QvcGF0aA";
      const result = NamespaceService.generateNamespaceName(path);
      assertEquals(result, expected);
    });

    it("should handle empty paths", () => {
      const path = "";
      const expected = "ns_";
      const result = NamespaceService.generateNamespaceName(path);
      assertEquals(result, expected);
    });
  });
});
