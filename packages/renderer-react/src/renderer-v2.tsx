import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import type { ComponentRegistryV2, DynamicRendererV2Props, RendererWarningV2 } from "./types-v2";

function DefaultFallback({ type, elementId }: { type: string; elementId?: string }) {
  return (
    <div data-fallback="true" data-type={type} data-element-id={elementId}>
      Unknown component: {type}
    </div>
  );
}

function pathSegments(path: string): string[] | null {
  if (path === "/") {
    return [];
  }
  if (!path.startsWith("/")) {
    return null;
  }
  return path
    .slice(1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function clonePathForWrite(root: Record<string, unknown>, path: string): Record<string, unknown> {
  const segments = pathSegments(path);
  if (!segments) {
    return root;
  }

  const nextRoot = structuredClone(root);
  let cursor: unknown = nextRoot;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    if (Array.isArray(cursor)) {
      const index = Number.parseInt(key, 10);
      const current = cursor[index];
      if (current === null || typeof current !== "object") {
        cursor[index] = {};
      }
      cursor = cursor[index] as unknown;
      continue;
    }

    if (cursor && typeof cursor === "object") {
      const record = cursor as Record<string, unknown>;
      if (record[key] === null || typeof record[key] !== "object") {
        record[key] = {};
      }
      cursor = record[key];
    }
  }

  return nextRoot;
}

function setValueAtPath(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const segments = pathSegments(path);
  if (!segments || segments.length === 0) {
    return root;
  }
  const nextRoot = clonePathForWrite(root, path);
  let cursor: unknown = nextRoot;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    if (Array.isArray(cursor)) {
      cursor = cursor[Number.parseInt(key, 10)];
    } else if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }

  const last = segments[segments.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = Number.parseInt(last, 10);
    cursor[index] = value;
  } else if (cursor && typeof cursor === "object") {
    (cursor as Record<string, unknown>)[last] = value;
  }

  return nextRoot;
}

function removeValueAtPath(root: Record<string, unknown>, path: string): Record<string, unknown> {
  const segments = pathSegments(path);
  if (!segments || segments.length === 0) {
    return root;
  }

  const nextRoot = clonePathForWrite(root, path);
  let cursor: unknown = nextRoot;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    if (Array.isArray(cursor)) {
      cursor = cursor[Number.parseInt(key, 10)];
    } else if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }

  const last = segments[segments.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = Number.parseInt(last, 10);
    if (Number.isFinite(index) && index >= 0 && index < cursor.length) {
      cursor.splice(index, 1);
    }
  } else if (cursor && typeof cursor === "object") {
    delete (cursor as Record<string, unknown>)[last];
  }

  return nextRoot;
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

function resolveActionParams(
  params: Record<string, unknown> | undefined,
  state: Record<string, unknown>,
  scope: RepeatScopeV2 | undefined
): Record<string, unknown> {
  if (!params) {
    return {};
  }
  const resolved = resolveDynamicValueV2(params, { state, scope });
  return (resolved ?? {}) as Record<string, unknown>;
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

function toStringSafe(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function DynamicRendererV2({ spec, registry, fallback, onWarning }: DynamicRendererV2Props) {
  const Fallback = fallback ?? DefaultFallback;
  const [state, setState] = useState<Record<string, unknown>>(() => (spec?.state ?? {}) as Record<string, unknown>);
  const previousStateRef = useRef<Record<string, unknown>>(state);
  const suppressWatchRef = useRef<boolean>(false);

  useEffect(() => {
    setState((spec?.state ?? {}) as Record<string, unknown>);
  }, [spec]);

  const warn = useCallback(
    (warning: RendererWarningV2): void => {
      onWarning?.(warning);
    },
    [onWarning]
  );

  const executeAction = useCallback(
    (action: ActionBindingV2, scope: RepeatScopeV2 | undefined): void => {
      setState((current) => {
        const params = resolveActionParams(action.params, current, scope);

        if (action.action === "setState") {
          const path = params.path;
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_SET_STATE",
              message: "setState action requires a valid JSON-pointer path.",
              elementId: undefined
            });
            return current;
          }
          suppressWatchRef.current = true;
          return setValueAtPath(current, path, params.value);
        }

        if (action.action === "pushState") {
          const path = params.path;
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_PUSH_STATE",
              message: "pushState action requires a valid JSON-pointer path."
            });
            return current;
          }
          const existing = getValueAtStatePath(current, path);
          const nextArray = Array.isArray(existing) ? [...existing, params.value] : [params.value];
          suppressWatchRef.current = true;
          return setValueAtPath(current, path, nextArray);
        }

        if (action.action === "removeState") {
          const path = params.path;
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_REMOVE_STATE",
              message: "removeState action requires a valid JSON-pointer path."
            });
            return current;
          }
          suppressWatchRef.current = true;
          return removeValueAtPath(current, path);
        }

        if (action.action === "validateForm") {
          const path = params.path;
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_VALIDATE_FORM",
              message: "validateForm action requires a valid JSON-pointer path."
            });
            return current;
          }

          const formValue = getValueAtStatePath(current, path);
          const required = Array.isArray(params.required) ? params.required.filter((v) => typeof v === "string") : [];

          let valid = true;
          if (formValue && typeof formValue === "object" && !Array.isArray(formValue)) {
            const form = formValue as Record<string, unknown>;
            for (const field of required) {
              if (!toStringSafe(form[field]).trim()) {
                valid = false;
                break;
              }
            }
          }
          suppressWatchRef.current = true;
          return setValueAtPath(current, `${path}/_valid`, valid);
        }

        return current;
      });
    },
    [warn]
  );

  const executeActions = useCallback(
    (actions: ActionBindingV2[], scope: RepeatScopeV2 | undefined): void => {
      for (const action of actions) {
        executeAction(action, scope);
      }
    },
    [executeAction]
  );

  const watchBindings = useMemo(() => {
    if (!spec) {
      return [] as Array<{ path: string; actions: ActionBindingV2[] }>;
    }
    const entries: Array<{ path: string; actions: ActionBindingV2[] }> = [];
    for (const element of Object.values(spec.elements)) {
      if (!element.watch) {
        continue;
      }
      for (const [path, binding] of Object.entries(element.watch)) {
        entries.push({
          path,
          actions: extractActionList(binding)
        });
      }
    }
    return entries;
  }, [spec]);

  useEffect(() => {
    if (!spec) {
      return;
    }

    if (suppressWatchRef.current) {
      suppressWatchRef.current = false;
      previousStateRef.current = state;
      return;
    }

    const previousState = previousStateRef.current;
    for (const watchEntry of watchBindings) {
      const previousValue = getValueAtStatePath(previousState, watchEntry.path);
      const currentValue = getValueAtStatePath(state, watchEntry.path);
      if (Object.is(previousValue, currentValue)) {
        continue;
      }
      executeActions(watchEntry.actions, undefined);
    }

    previousStateRef.current = state;
  }, [executeActions, spec, state, watchBindings]);

  const renderElement = useCallback(
    (elementId: string, scope: RepeatScopeV2 | undefined, keySuffix?: string): ReactNode => {
      if (!spec) {
        return null;
      }

      const element = spec.elements[elementId];
      if (!element) {
        return <Fallback key={`${elementId}${keySuffix ?? ""}`} type="MISSING_ELEMENT" elementId={elementId} />;
      }

      let shouldRender = true;
      try {
        shouldRender = evaluateVisibilityV2(element.visible, { state, scope });
      } catch (error) {
        warn({
          code: "V2_VISIBILITY_EVALUATION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Visibility evaluation failed; rendering element as visible.",
          elementId
        });
        shouldRender = true;
      }

      if (!shouldRender) {
        return null;
      }

      const renderSingle = (instanceScope: RepeatScopeV2 | undefined, localKey?: string): ReactNode => {
        const Component = registry[element.type];
        const rawResolvedProps = resolveDynamicValueV2(element.props, { state, scope: instanceScope }) as Record<
          string,
          unknown
        >;
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
              const eventValue =
                event && typeof event === "object" && "target" in (event as Record<string, unknown>)
                  ? (event as { target?: { value?: unknown; checked?: unknown } }).target
                  : undefined;

              for (const action of actions) {
                const mergedParams = {
                  ...(action.params ?? {}),
                  eventValue: eventValue?.value,
                  eventChecked: eventValue?.checked
                };
                executeAction({ ...action, params: mergedParams }, instanceScope);
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

          const boundValue = resolveBoundValue(ref, state, instanceScope);
          if (propKey === "checked") {
            resolvedProps.checked = Boolean(boundValue);
          } else {
            resolvedProps[propKey] = boundValue ?? "";
          }

          if (ref.kind === "state") {
            injectedHandlers.onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const target = event.target;
              const nextValue =
                propKey === "checked" && target instanceof HTMLInputElement
                  ? target.checked
                  : target.value;
              executeAction(
                {
                  action: "setState",
                  params: {
                    path: ref.path,
                    value: nextValue
                  }
                },
                instanceScope
              );
            };
          }
        }

        const children = element.children.map((childId) =>
          renderElement(childId, instanceScope, `${localKey ?? ""}_${childId}`)
        );

        const props = {
          elementId,
          element,
          ...resolvedProps,
          ...injectedHandlers,
          children
        };

        if (!Component) {
          return <Fallback key={`${elementId}${localKey ?? ""}`} type={element.type} elementId={elementId} />;
        }

        return (
          <RenderErrorBoundary key={`${elementId}${localKey ?? ""}`} componentType={element.type}>
            <Component {...props} />
          </RenderErrorBoundary>
        );
      };

      if (element.repeat) {
        const scopes = expandRepeatScopesV2({ state }, element.repeat.statePath, element.repeat.key);
        if (scopes.length === 0) {
          return null;
        }
        return (
          <Fragment key={`${elementId}${keySuffix ?? ""}`}>
            {scopes.map((entry) => renderSingle(entry.scope, `${keySuffix ?? ""}_${entry.key}`))}
          </Fragment>
        );
      }

      return renderSingle(scope, keySuffix);
    },
    [executeAction, registry, spec, state, warn, Fallback]
  );

  if (!spec || !spec.root) {
    return null;
  }

  return <>{renderElement(spec.root, undefined)}</>;
}
