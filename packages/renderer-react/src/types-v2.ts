import type { ComponentType, ReactNode } from "react";
import type { UISpecElementV2, UISpecV2 } from "@repo/contracts";

export type RegisteredComponentPropsV2 = {
  elementId: string;
  element: UISpecElementV2;
  children?: ReactNode;
} & Record<string, unknown>;

export type ComponentRegistryV2 = Record<string, ComponentType<RegisteredComponentPropsV2>>;

export interface RendererWarningV2 {
  code: string;
  message: string;
  elementId?: string;
}

export interface DynamicRendererV2Props {
  spec: UISpecV2 | null;
  registry: ComponentRegistryV2;
  fallback?: ComponentType<{ type: string; elementId?: string }>;
  onWarning?: (warning: RendererWarningV2) => void;
}
