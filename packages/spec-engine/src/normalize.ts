import type { UIComponentNode, UISpec, UISpecElement } from "@repo/contracts";

export interface NormalizeOptions {
  textElementType?: string;
}

const DEFAULT_TEXT_ELEMENT_TYPE = "Text";

export function normalizeTreeToSpec(
  rootNode: UIComponentNode,
  options: NormalizeOptions = {}
): UISpec {
  const textElementType = options.textElementType ?? DEFAULT_TEXT_ELEMENT_TYPE;
  const elements: Record<string, UISpecElement> = {};

  const walk = (node: UIComponentNode): string => {
    const nodeId = node.id;
    const childIds: string[] = [];

    if (node.children) {
      for (const [i, child] of node.children.entries()) {

        if (typeof child === "string") {
          const textId = `${nodeId}__text_${i}`;
          elements[textId] = {
            type: textElementType,
            props: { text: child },
            children: []
          };
          childIds.push(textId);
        } else {
          childIds.push(walk(child));
        }
      }
    }

    elements[nodeId] = {
      type: node.type,
      props: (node.props ?? {}) as Record<string, unknown>,
      children: childIds
    };

    return nodeId;
  };

  const root = walk(rootNode);
  return {
    root,
    elements
  };
}
