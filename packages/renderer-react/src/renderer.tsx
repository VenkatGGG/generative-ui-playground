import React, { type ComponentType, type ReactNode } from "react";
import type { UISpec } from "@repo/contracts";
import { RenderErrorBoundary } from "./error-boundary";
import type { ComponentRegistry, DynamicRendererProps, RegisteredComponentProps } from "./types";

function DefaultFallback({ type, elementId }: { type: string; elementId?: string }) {
  return (
    <div data-fallback="true" data-type={type} data-element-id={elementId}>
      Unknown component: {type}
    </div>
  );
}

function renderNode(
  spec: UISpec,
  elementId: string,
  registry: ComponentRegistry,
  Fallback: ComponentType<{ type: string; elementId?: string }>
): ReactNode {
  const element = spec.elements[elementId];

  if (!element) {
    return <Fallback key={elementId} type="MISSING_ELEMENT" elementId={elementId} />;
  }

  const Component = registry[element.type];
  const children = element.children.map((childId) => renderNode(spec, childId, registry, Fallback));

  const props: RegisteredComponentProps = {
    elementId,
    element,
    ...(element.props ?? {}),
    children
  };

  if (!Component) {
    return <Fallback key={elementId} type={element.type} elementId={elementId} />;
  }

  return (
    <RenderErrorBoundary key={elementId} componentType={element.type}>
      <Component {...props} />
    </RenderErrorBoundary>
  );
}

export function DynamicRenderer({ spec, registry, fallback }: DynamicRendererProps) {
  if (!spec || !spec.root) {
    return null;
  }

  const Fallback = fallback ?? DefaultFallback;
  return <>{renderNode(spec, spec.root, registry, Fallback)}</>;
}
