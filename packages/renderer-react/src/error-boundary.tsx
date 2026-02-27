import React, { type ErrorInfo, type ReactNode } from "react";

interface Props {
  componentType: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class RenderErrorBoundary extends React.Component<Props, State> {
  public constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[renderer-react] render failure in '${this.props.componentType}'`, error, info.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
