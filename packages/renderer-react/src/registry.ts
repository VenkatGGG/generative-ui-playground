import type { ComponentRegistry } from "./types";

export function createStrictRegistry(registry: ComponentRegistry): ComponentRegistry {
  return Object.freeze({ ...registry });
}

export function hasComponent(registry: ComponentRegistry, type: string): boolean {
  return Boolean(registry[type]);
}
