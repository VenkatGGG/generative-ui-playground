import React from "react";
import {
  createStrictRegistryV2,
  type RegisteredComponentPropsV2
} from "@repo/renderer-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asSeparatorOrientation(value: unknown): "horizontal" | "vertical" {
  return value === "vertical" ? "vertical" : "horizontal";
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asButtonVariant(value: unknown): ButtonProps["variant"] | undefined {
  if (value === "default" || value === "outline" || value === "secondary" || value === "destructive") {
    return value;
  }
  return undefined;
}

function asButtonSize(value: unknown): ButtonProps["size"] | undefined {
  if (value === "default" || value === "sm" || value === "lg") {
    return value;
  }
  return undefined;
}

function asBadgeVariant(value: unknown): BadgeProps["variant"] | undefined {
  if (value === "default" || value === "outline" || value === "secondary" || value === "destructive") {
    return value;
  }
  return undefined;
}

function asSelectOptions(value: unknown): SelectOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { label: entry, value: entry } satisfies SelectOption;
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const label = (entry as Record<string, unknown>).label;
        const optionValue = (entry as Record<string, unknown>).value;
        if (typeof label === "string" && typeof optionValue === "string") {
          return { label, value: optionValue } satisfies SelectOption;
        }
      }
      return null;
    })
    .filter((entry): entry is SelectOption => entry !== null);
}

function asChangeHandler(value: unknown): React.ChangeEventHandler<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
> | undefined {
  return typeof value === "function"
    ? (value as React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>)
    : undefined;
}

function asClickHandler(value: unknown): React.MouseEventHandler<HTMLButtonElement> | undefined {
  return typeof value === "function" ? (value as React.MouseEventHandler<HTMLButtonElement>) : undefined;
}

function RegistryCard({ children, className }: RegisteredComponentPropsV2) {
  return <Card className={asString(className)}>{children}</Card>;
}

function RegistryCardHeader({ children, className }: RegisteredComponentPropsV2) {
  return <CardHeader className={asString(className)}>{children}</CardHeader>;
}

function RegistryCardTitle({ children, className }: RegisteredComponentPropsV2) {
  return <CardTitle className={asString(className)}>{children}</CardTitle>;
}

function RegistryCardDescription({ children, className }: RegisteredComponentPropsV2) {
  return <CardDescription className={asString(className)}>{children}</CardDescription>;
}

function RegistryCardContent({ children, className }: RegisteredComponentPropsV2) {
  return <CardContent className={asString(className)}>{children}</CardContent>;
}

function RegistryCardFooter({ children, className }: RegisteredComponentPropsV2) {
  return <CardFooter className={asString(className)}>{children}</CardFooter>;
}

function RegistryText({ text, children, className }: RegisteredComponentPropsV2) {
  const displayText =
    typeof text === "string" || typeof text === "number" || typeof text === "boolean"
      ? String(text)
      : children;
  return <span className={asString(className)}>{displayText}</span>;
}

function RegistryButton({ children, className, variant, size, onClick, type }: RegisteredComponentPropsV2) {
  return (
    <Button
      className={asString(className)}
      variant={asButtonVariant(variant)}
      size={asButtonSize(size)}
      onClick={asClickHandler(onClick)}
      type={asString(type) === "submit" ? "submit" : "button"}
    >
      {children}
    </Button>
  );
}

function RegistryBadge({ children, className, variant }: RegisteredComponentPropsV2) {
  return (
    <Badge className={asString(className)} variant={asBadgeVariant(variant)}>
      {children}
    </Badge>
  );
}

function RegistryInput({ className, placeholder, type, value, onChange }: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedValue = asString(value);
  return (
    <Input
      className={asString(className)}
      placeholder={asString(placeholder)}
      type={asString(type)}
      {...(resolvedOnChange
        ? {
            value: resolvedValue ?? "",
            onChange: resolvedOnChange
          }
        : {
            defaultValue: resolvedValue
          })}
    />
  );
}

function RegistryTextarea({
  className,
  placeholder,
  value,
  rows,
  onChange
}: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedValue = asString(value);
  return (
    <Textarea
      className={asString(className)}
      placeholder={asString(placeholder)}
      rows={asNumber(rows)}
      {...(resolvedOnChange
        ? {
            value: resolvedValue ?? "",
            onChange: resolvedOnChange
          }
        : {
            defaultValue: resolvedValue
          })}
    />
  );
}

function RegistrySeparator({ className, orientation }: RegisteredComponentPropsV2) {
  return <Separator className={asString(className)} orientation={asSeparatorOrientation(orientation)} />;
}

function RegistryCheckbox({ className, checked, label, onChange }: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedChecked = asBoolean(checked);
  return (
    <Checkbox
      className={asString(className)}
      label={asString(label)}
      {...(resolvedOnChange
        ? {
            checked: resolvedChecked ?? false,
            onChange: resolvedOnChange
          }
        : {
            defaultChecked: resolvedChecked
          })}
    />
  );
}

function RegistrySelect({ className, options, value, onChange }: RegisteredComponentPropsV2) {
  const resolvedOnChange = asChangeHandler(onChange);
  const resolvedValue = asString(value);
  return (
    <Select
      className={asString(className)}
      options={asSelectOptions(options)}
      {...(resolvedOnChange
        ? {
            value: resolvedValue ?? "",
            onChange: resolvedOnChange
          }
        : {
            defaultValue: resolvedValue
          })}
    />
  );
}

function RegistryStack({ children, className, direction, gap }: RegisteredComponentPropsV2) {
  const directionClass = direction === "horizontal" ? "flex-row" : "flex-col";
  const gapClass = typeof gap === "string" ? gap : "gap-2";
  return <div className={cn("flex", directionClass, gapClass, asString(className))}>{children}</div>;
}

export const studioRegistry = createStrictRegistryV2({
  Card: RegistryCard,
  CardHeader: RegistryCardHeader,
  CardTitle: RegistryCardTitle,
  CardDescription: RegistryCardDescription,
  CardContent: RegistryCardContent,
  CardFooter: RegistryCardFooter,
  Button: RegistryButton,
  Badge: RegistryBadge,
  Text: RegistryText,
  Input: RegistryInput,
  Textarea: RegistryTextarea,
  Separator: RegistrySeparator,
  Checkbox: RegistryCheckbox,
  Select: RegistrySelect,
  Stack: RegistryStack
});
