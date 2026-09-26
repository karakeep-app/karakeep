import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { DecoratorNode } from "lexical";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type SerializedImageNode = Spread<
  {
    src: string | null;
    altText: string;
  },
  SerializedLexicalNode
>;

function ImageComponent({
  src,
  altText,
  uploading,
  errorMessage,
}: {
  src: string | null;
  altText: string;
  uploading: boolean;
  errorMessage: string | null;
}) {
  if (errorMessage) {
    return (
      <span className="inline-block rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 align-middle text-xs text-destructive">
        Failed to upload image: {errorMessage}
      </span>
    );
  }
  if (uploading) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 px-2 py-1 align-middle text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Uploading image...
      </span>
    );
  }
  if (!src) {
    return null;
  }
  return <LoadableImage key={src} src={src} altText={altText} />;
}

function LoadableImage({ src, altText }: { src: string; altText: string }) {
  const [failedToLoad, setFailedToLoad] = React.useState(false);

  if (failedToLoad) {
    return (
      <span className="inline-block rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 align-middle text-xs text-destructive">
        Image not found (it may have been deleted)
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={altText}
      draggable={false}
      className={cn("inline-block max-w-full rounded-md align-middle")}
      onError={() => setFailedToLoad(true)}
    />
  );
}

export class ImageNode extends DecoratorNode<React.ReactElement> {
  __src: string | null;
  __altText: string;
  __uploading: boolean;
  __errorMessage: string | null;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    const cloned = new ImageNode(node.__src, node.__altText, node.__key);
    cloned.__uploading = node.__uploading;
    cloned.__errorMessage = node.__errorMessage;
    return cloned;
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: serializedNode.src,
      altText: serializedNode.altText,
    });
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      src: this.__src,
      altText: this.__altText,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: convertImageElement,
        priority: 0,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("img");
    if (this.__src) {
      element.setAttribute("src", this.__src);
    }
    element.setAttribute("alt", this.__altText);
    return { element };
  }

  constructor(src: string | null, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__uploading = false;
    this.__errorMessage = null;
  }

  isInline(): boolean {
    return true;
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    if (this.__uploading || this.__errorMessage) {
      return "";
    }
    return `![${this.__altText}](${this.__src})`;
  }

  getSrc(): string | null {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  isUploading(): boolean {
    return this.__uploading;
  }

  getErrorMessage(): string | null {
    return this.__errorMessage;
  }

  setSrc(src: string): void {
    const writable = this.getWritable();
    writable.__src = src;
  }

  setUploading(uploading: boolean): void {
    const writable = this.getWritable();
    writable.__uploading = uploading;
  }

  setErrorMessage(message: string | null): void {
    const writable = this.getWritable();
    writable.__errorMessage = message;
  }

  decorate(): React.ReactElement {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        uploading={this.__uploading}
        errorMessage={this.__errorMessage}
      />
    );
  }
}

function convertImageElement(domNode: Node): DOMConversionOutput | null {
  if (domNode instanceof HTMLImageElement) {
    const { src, alt } = domNode;
    return { node: $createImageNode({ src, altText: alt }) };
  }
  return null;
}

export function $createImageNode({
  src,
  altText,
  uploading = false,
}: {
  src: string | null;
  altText: string;
  uploading?: boolean;
}): ImageNode {
  const node = new ImageNode(src, altText);
  if (uploading) {
    node.__uploading = true;
  }
  return node;
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
