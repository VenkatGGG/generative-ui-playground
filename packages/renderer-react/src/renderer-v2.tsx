import React, {
  Fragment,
  type ChangeEvent,
  type ComponentType,
  type ReactNode
} from "react";
import type { ActionBindingV2, UISpecElementV2, UISpecV2 } from "@repo/contracts";
import {
  evaluateVisibilityV2,
  expandRepeatScopesV2,
  getValueAtStatePath,
  resolveDynamicValueV2,
  type BindingRefV2,
  type RepeatScopeV2
} from "@repo/spec-engine";
import { RenderErrorBoundary } from "./error-boundary";
import { RepeatScopeProviderV2, useRepeatScopeV2 } from "./repeat-scope-v2";
import { RuntimeProviderV2, useRuntimeV2 } from "./runtime-v2-context";
import type { ComponentRegistryV2, DynamicRendererV2Props } from "./types-v2";

function DefaultFallback({ type, elementId }: { type: string; elementId?: string }) {
  return (
    <div data-fallback="true" data-type={type} data-element-id={elementId}>
      Unknown component: {type}
    </div>
  );
}

function extractActionList(binding: ActionBindingV2 | ActionBindingV2[] | undefined): ActionBindingV2[] {
  if (!binding) {
    return [];
  }
  return Array.isArray(binding) ? binding : [binding];
}

function eventNameToReactProp(name: string): "onClick" | "onChange" | "onSubmit" | null {
  if (name === "press") {
    return "onClick";
  }
  if (name === "change") {
    return "onChange";
  }
  if (name === "submit") {
    return "onSubmit";
  }
  return null;
}

function resolveBoundValue(ref: BindingRefV2, state: Record<string, unknown>, scope?: RepeatScopeV2): unknown {
  if (ref.kind === "state") {
    return getValueAtStatePath(state, ref.path);
  }
  if (!scope || scope.item === null || typeof scope.item !== "object" || Array.isArray(scope.item)) {
    return undefined;
  }
  return (scope.item as Record<string, unknown>)[ref.field];
}

interface RenderNodeProps {
  spec: UISpecV2;
  registry: ComponentRegistryV2;
  fallback: ComponentType<{ type: string; elementId?: string }>;
  elementId: string;
  keySuffix?: string;
}

function RenderNodeV2({ spec, registry, fallback, elementId, keySuffix }: RenderNodeProps): ReactNode {
  const { state } = useRuntimeV2();
  const element = spec.elements[elementId];
  if (!element) {
    return React.createElement(fallback, {
      key: `${elementId}${keySuffix ?? ""}`,
      type: "MISSING_ELEMENT",
      elementId
    });
  }

  if (element.repeat) {
    const scopes = expandRepeatScopesV2({ state }, element.repeat.statePath, element.repeat.key);
    if (scopes.length === 0) {
      return null;
    }
    return (
      <Fragment key={`${elementId}${keySuffix ?? ""}`}>
        {scopes.map((entry) => (
          <RepeatScopeProviderV2 key={`${elementId}${keySuffix ?? ""}_${entry.key}`} scope={entry.scope}>
            <RenderNodeBodyV2
              spec={spec}
              registry={registry}
              fallback={fallback}
              elementId={elementId}
              keySuffix={`${keySuffix ?? ""}_${entry.key}`}
            />
          </RepeatScopeProviderV2>
        ))}
      </Fragment>
    );
  }

  return (
    <RenderNodeBodyV2
      spec={spec}
      registry={registry}
      fallback={fallback}
      elementId={elementId}
      keySuffix={keySuffix}
    />
  );
}

function RenderNodeBodyV2({ spec, registry, fallback, elementId, keySuffix }: RenderNodeProps): ReactNode {
  const { state, warn, executeAction } = useRuntimeV2();
  const scope = useRepeatScopeV2();
  const element = spec.elements[elementId];
  if (!element) {
    return React.createElement(fallback, {
      key: `${elementId}${keySuffix ?? ""}`,
      type: "MISSING_ELEMENT",
      elementId
    });
  }

  let shouldRender = true;
  try {
    shouldRender = evaluateVisibilityV2(element.visible, { state, scope });
  } catch (error) {
    warn({
      code: "V2_VISIBILITY_EVALUATION_FAILED",
      message: error instanceof Error ? error.message : "Visibility evaluation failed; rendering as visible.",
      elementId
    });
    shouldRender = true;
  }

  if (!shouldRender) {
    return null;
  }

  const Component = registry[element.type];
  const rawResolvedProps = resolveDynamicValueV2(element.props, { state, scope }) as Record<string, unknown>;
  const resolvedProps: Record<string, unknown> = { ...rawResolvedProps };
  const injectedHandlers: Record<string, unknown> = {};

  if (element.on) {
    for (const [eventName, actionBinding] of Object.entries(element.on)) {
      const reactEventName = eventNameToReactProp(eventName);
      if (!reactEventName) {
        warn({
          code: "V2_UNSUPPORTED_EVENT",
          message: `Event '${eventName}' is not supported by runtime.`,
          elementId
        });
        continue;
      }
      const actions = extractActionList(actionBinding);
      injectedHandlers[reactEventName] = (event: unknown) => {
        const eventTarget =
          event && typeof event === "object" && "target" in (event as Record<string, unknown>)
            ? (event as { target?: { value?: unknown; checked?: unknown } }).target
            : undefined;

        for (const action of actions) {
          const mergedParams = {
            ...(action.params ?? {}),
            eventValue: eventTarget?.value,
            eventChecked: eventTarget?.checked
          };
          executeAction({ ...action, params: mergedParams }, scope);
        }
      };
    }
  }

  for (const [propKey, propValue] of Object.entries(rawResolvedProps)) {
    if (!propValue || typeof propValue !== "object" || Array.isArray(propValue)) {
      continue;
    }
    const ref = propValue as BindingRefV2;
    if (ref.kind !== "state" && ref.kind !== "item") {
      continue;
    }

    const boundValue = resolveBoundValue(ref, state, scope);
    if (propKey === "checked") {
      resolvedProps.checked = Boolean(boundValue);
    } else {
      resolvedProps[propKey] = boundValue ?? "";
    }

    if (ref.kind === "state") {
      injectedHandlers.onChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const target = event.target;
        const nextValue =
          propKey === "checked" && target instanceof HTMLInputElement ? target.checked : target.value;
        executeAction(
          {
            action: "setState",
            params: {
              path: ref.path,
              value: nextValue
            }
          },
          scope
        );
      };
    }
  }

  const children = element.children.map((childId) => (
    <RenderNodeV2
      key={`${elementId}${keySuffix ?? ""}_${childId}`}
      spec={spec}
      registry={registry}
      fallback={fallback}
      elementId={childId}
      keySuffix={`${keySuffix ?? ""}_${childId}`}
    />
  ));

  const slotProps: Record<string, ReactNode> = {};
  if (element.slots) {
    for (const [slotName, slotChildren] of Object.entries(element.slots)) {
      slotProps[slotName] = slotChildren.map((childId) => (
        <RenderNodeV2
          key={`${elementId}${keySuffix ?? ""}_${slotName}_${childId}`}
          spec={spec}
          registry={registry}
          fallback={fallback}
          elementId={childId}
          keySuffix={`${keySuffix ?? ""}_${slotName}_${childId}`}
        />
      ));
    }
  }

  const props = {
    elementId,
    element: element as UISpecElementV2,
    ...resolvedProps,
    ...slotProps,
    ...injectedHandlers,
    children
  };

  if (!Component) {
    return React.createElement(fallback, {
      key: `${elementId}${keySuffix ?? ""}`,
      type: element.type,
      elementId
    });
  }

  return (
    <RenderErrorBoundary key={`${elementId}${keySuffix ?? ""}`} componentType={element.type}>
      <Component {...props} />
    </RenderErrorBoundary>
  );
}

export function DynamicRendererV2({ spec, registry, fallback, onWarning }: DynamicRendererV2Props) {
  const Fallback = fallback ?? DefaultFallback;
  if (!spec || !spec.root) {
    return null;
  }

  return (
    <RuntimeProviderV2 spec={spec} onWarning={onWarning}>
      <RepeatScopeProviderV2 scope={undefined}>
        <RenderNodeV2 spec={spec} registry={registry} fallback={Fallback} elementId={spec.root} />
      </RepeatScopeProviderV2>
    </RuntimeProviderV2>
  );
}
