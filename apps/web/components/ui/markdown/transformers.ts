import { TextMatchTransformer } from "@lexical/markdown";
import { TRANSFORMERS } from "@lexical/markdown";

import { $createImageNode, $isImageNode, ImageNode } from "./nodes/image-node";

export const IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }
    if (node.isUploading() || node.getErrorMessage()) {
      return "";
    }
    return `![${node.getAltText()}](${node.getSrc()})`;
  },
  importRegExp: /!\[([^[]*)\]\(([^(]+)\)/,
  regExp: /!\[([^[]*)\]\(([^(]+)\)$/,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    const imageNode = $createImageNode({ altText, src });
    textNode.replace(imageNode);
  },
  trigger: ")",
  type: "text-match",
};

export const EDITOR_TRANSFORMERS = [IMAGE_TRANSFORMER, ...TRANSFORMERS];
