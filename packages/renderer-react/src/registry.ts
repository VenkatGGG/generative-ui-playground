import type { ComponentRegistry } from "./types";
import type { ComponentRegistryV2 } from "./types-v2";

export function createStrictRegistry(registry: ComponentRegistry): ComponentRegistry {
  return Object.freeze({ ...registry });
}

export function hasComponent(registry: ComponentRegistry, type: string): boolean {
  return Boolean(registry[type]);
}

export function createStrictRegistryV2(registry: ComponentRegistryV2): ComponentRegistryV2 {
  return Object.freeze({ ...registry });
}
