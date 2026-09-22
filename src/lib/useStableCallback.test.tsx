import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableCallback } from './useStableCallback';

/**
 * The board's memoised cards and roster rows compare handler identity, so a handler that changes identity on
 * every poll defeats the memo and re-renders the whole board. This is that contract.
 */
describe('useStableCallback', () => {
  it('keeps one identity across renders while still calling the latest closure', () => {
    const identities = new Set<unknown>();
    let seen = -1;

    function Probe() {
      const [count, setCount] = useState(0);
      const handler = useStableCallback(() => {
        seen = count;
      });
      identities.add(handler);
      return (
        <>
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            bump
          </button>
          <button type="button" onClick={handler}>
            report
          </button>
        </>
      );
    }

    render(<Probe />);
    const bump = screen.getByRole('button', { name: 'bump' });

    fireEvent.click(screen.getByRole('button', { name: 'report' }));
    expect(seen).toBe(0);

    act(() => void fireEvent.click(bump));
    act(() => void fireEvent.click(bump));
    fireEvent.click(screen.getByRole('button', { name: 'report' }));

    // Three renders, one handler, and it saw the newest state.
    expect(identities.size).toBe(1);
    expect(seen).toBe(2);
  });
})
