import type { ComponentType, ReactNode } from "react";
import type { UISpec, UISpecElement } from "@repo/contracts";

export type RegisteredComponentProps = {
  elementId: string;
  element: UISpecElement;
  children?: ReactNode;
} & Record<string, unknown>;

export type ComponentRegistry = Record<string, ComponentType<RegisteredComponentProps>>;

export interface DynamicRendererProps {
  spec: UISpec | null;
  registry: ComponentRegistry;
  fallback?: ComponentType<{ type: string; elementId?: string }>;
}
