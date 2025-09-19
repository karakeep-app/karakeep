import React from "react";
import { DraggableEvent } from "react-draggable";

export interface DraggingState {
  isDragging: boolean;
  initialX: number;
  initialY: number;
}

export function useDragAndDrop(
  dragTargetIdAttribute: string,
  onDragOver: (dragTargetId: string) => void,
  setDraggingState?: React.Dispatch<React.SetStateAction<DraggingState>>,
) {
  function findTargetId(element: HTMLElement): string | null {
    let currentElement: HTMLElement | null = element;
    while (currentElement) {
      const listId = currentElement.getAttribute(dragTargetIdAttribute);
      if (listId) {
        return listId;
      }
      currentElement = currentElement.parentElement;
    }
    return null;
  }

  const handleDragStart = React.useCallback(
    (e: DraggableEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setDraggingState?.({
        isDragging: true,
        initialX: rect.x,
        initialY: rect.y,
      });
    },
    [setDraggingState],
  );

  const handleDragEnd = React.useCallback(
    (e: DraggableEvent) => {
      const { target } = e;
      const dragTargetId = findTargetId(target as HTMLElement);

      if (dragTargetId) {
        /*          As Draggable tries to setState when the 
          component is unmounted, it is needed to
          push onCombine to the event loop queue.
          onCombine would be run after setState on
          Draggable so it would fix the issue until
          they fix it on their end.
      */
        setTimeout(() => {
          onDragOver(dragTargetId);
        }, 0);
      }
      setDraggingState?.({
        isDragging: false,
        initialX: 0,
        initialY: 0,
      });
    },
    [onDragOver],
  );

  return {
    handleDragStart,
    handleDragEnd,
  };
}
