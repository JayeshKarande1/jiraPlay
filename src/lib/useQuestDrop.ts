import { useState, type DragEvent } from 'react';

export const QUEST_DRAG_TYPE = 'application/x-jiraplay-quest';

/** Makes an element accept dropped quests. Spread `handlers` onto it; `hover` is true while a quest is over it. */
export function useQuestDrop(onDrop: (key: string) => void) {
  const [hover, setHover] = useState(false);
  return {
    hover,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(QUEST_DRAG_TYPE)) return;
        e.preventDefault();
        setHover(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setHover(false);
        const key = e.dataTransfer.getData(QUEST_DRAG_TYPE);
        if (key) onDrop(key);
      },
    },
  };
}
