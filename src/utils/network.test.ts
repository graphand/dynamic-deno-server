import { assertEquals, assertNotEquals, assertMatch } from "https://deno.land/std@0.200.0/testing/asserts.ts";
import { generateNamespaceName, generateIPAddresses, generateIndexFromPath } from "./network.ts";

Deno.test("generateNamespaceName", async t => {
  await t.step("should generate valid namespace names", () => {
    const testPath = "/opt/functions/test-service";
    const namespace = generateNamespaceName(testPath);

    // Should start with ns_
    assertMatch(namespace, /^ns_/);

    // Should not contain = characters
    assertEquals(namespace.includes("="), false);

    // Should be deterministic
    const namespace2 = generateNamespaceName(testPath);
    assertEquals(namespace, namespace2);
  });
});

Deno.test("generateIPAddresses", async t => {
  await t.step("should generate valid IP addresses for index 0", () => {
    const { mainIP, childIP } = generateIPAddresses(0);
    assertEquals(mainIP, "10.200.0.0");
    assertEquals(childIP, "10.200.0.1");
  });

  await t.step("should generate valid IP addresses for index 127", () => {
    const { mainIP, childIP } = generateIPAddresses(127);
    assertEquals(mainIP, "10.200.0.254");
    assertEquals(childIP, "10.200.0.255");
  });

  await t.step("should handle index overflow correctly", () => {
    const { mainIP, childIP } = generateIPAddresses(128);
    assertEquals(mainIP, "10.200.1.0");
    assertEquals(childIP, "10.200.1.1");
  });
});

Deno.test("generateIndexFromPath", async t => {
  await t.step("should generate consistent indices", () => {
    const path1 = "/opt/functions/service-a";
    const path2 = "/opt/functions/service-b";

    const index1 = generateIndexFromPath(path1);
    const index2 = generateIndexFromPath(path1);
    const index3 = generateIndexFromPath(path2);

    // Same path should generate same index
    assertEquals(index1, index2);

    // Different paths should generate different indices
    assertNotEquals(index1, index3);
  });
});
