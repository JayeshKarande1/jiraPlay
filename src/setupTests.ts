import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

beforeAll(() => {
  // jsdom does no layout, so every element reports zero client rects and anything that filters on
  // visibility (useDialog's focus trap) sees an empty page. Report one box for rendered elements.
  Element.prototype.getClientRects = function getClientRects(this: Element) {
    const rects = this.isConnected ? [{ x: 0, y: 0, width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1 }] : [];
    return Object.assign(rects, { item: (i: number) => rects[i] ?? null }) as unknown as DOMRectList;
  };
});

afterEach(cleanup);
