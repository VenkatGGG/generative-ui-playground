import { describe, expect, it } from "vitest";
import {
  ALLOWED_COMPONENT_TYPES_V2,
  buildPass2CatalogSectionV2,
  canonicalizeCatalogComponentTypeV2,
  isAllowedComponentTypeV2
} from "./index";

describe("component-catalog v2", () => {
  it("contains the agreed 15 components", () => {
    expect(ALLOWED_COMPONENT_TYPES_V2).toHaveLength(15);
    expect(ALLOWED_COMPONENT_TYPES_V2).toContain("Checkbox");
    expect(ALLOWED_COMPONENT_TYPES_V2).toContain("Select");
    expect(ALLOWED_COMPONENT_TYPES_V2).toContain("Stack");
  });

  it("normalizes common aliases", () => {
    expect(canonicalizeCatalogComponentTypeV2("Container")).toBe("Stack");
    expect(canonicalizeCatalogComponentTypeV2("h2")).toBe("CardTitle");
    expect(canonicalizeCatalogComponentTypeV2("dropdown")).toBe("Select");
  });

  it("builds v2 catalog prompt section", () => {
    const section = buildPass2CatalogSectionV2();
    expect(section).toContain("AVAILABLE COMPONENTS (15)");
    expect(section).toContain("Checkbox");
    expect(section).toContain("events: change");
    expect(isAllowedComponentTypeV2("Card")).toBe(true);
  });
});
