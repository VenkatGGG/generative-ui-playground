import type {
  UIComponentNodeV2,
  UISpecElementV2,
  UISpecV2,
  UITreeSnapshotV2
} from "@repo/contracts";

export interface NormalizeOptionsV2 {
  textElementType?: string;
}

const DEFAULT_TEXT_ELEMENT_TYPE = "Text";

function normalizeNode(
  node: UIComponentNodeV2,
  elements: Record<string, UISpecElementV2>,
  textElementType: string
): string {
  const childIds: string[] = [];

  if (node.children) {
    for (const [index, child] of node.children.entries()) {
      if (typeof child === "string") {
        const textId = `${node.id}__text_${index}`;
        elements[textId] = {
          type: textElementType,
          props: { text: child },
          children: []
        };
        childIds.push(textId);
      } else {
        childIds.push(normalizeNode(child, elements, textElementType));
      }
    }
  }

  elements[node.id] = {
    type: node.type,
    props: (node.props ?? {}) as Record<string, unknown>,
    children: childIds,
    visible: node.visible,
    repeat: node.repeat,
    on: node.on,
    watch: node.watch
  };

  return node.id;
}

export function normalizeTreeToSpecV2(
  input: UITreeSnapshotV2 | UIComponentNodeV2,
  options: NormalizeOptionsV2 = {}
): UISpecV2 {
  const textElementType = options.textElementType ?? DEFAULT_TEXT_ELEMENT_TYPE;
  const elements: Record<string, UISpecElementV2> = {};

  const snapshot = "tree" in input ? input : { tree: input };
  const root = normalizeNode(snapshot.tree, elements, textElementType);

  return {
    root,
    elements,
    state: snapshot.state
  };
}
