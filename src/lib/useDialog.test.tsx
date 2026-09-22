import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useDialog } from './useDialog';

function Dialog({ label, autofocus = false }: { label: string; autofocus?: boolean }) {
  const ref = useDialog<HTMLDivElement>();
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button">{label} first</button>
      <button type="button" {...(autofocus ? { 'data-autofocus': '' } : {})}>
        {label} second
      </button>
    </div>
  );
}

function Harness({ autofocus = false }: { autofocus?: boolean }) {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuter(true)}>
        Open outer
      </button>
      {outer && <Dialog label="Outer" autofocus={autofocus} />}
      {outer && (
        <button type="button" onClick={() => setInner(true)}>
          Open inner
        </button>
      )}
      {inner && <Dialog label="Inner" />}
      {outer && (
        <button type="button" onClick={() => setOuter(false)}>
          Close outer
        </button>
      )}
    </>
  );
}

describe('useDialog', () => {
  it('moves focus to the first focusable element when it opens', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open outer' }));
    expect(screen.getByRole('button', { name: 'Outer first' })).toHaveFocus();
  });

  it('prefers the element marked data-autofocus', async () => {
    render(<Harness autofocus />);
    await userEvent.click(screen.getByRole('button', { name: 'Open outer' }));
    expect(screen.getByRole('button', { name: 'Outer second' })).toHaveFocus();
  });

  it('cycles Tab inside the dialog instead of leaving it', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open outer' }));

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Outer second' })).toHaveFocus();
    // The last element wraps back to the first rather than reaching the buttons outside.
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Outer first' })).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Outer second' })).toHaveFocus();
  });

  it('traps only the innermost dialog while two are open', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open outer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open inner' }));
    expect(screen.getByRole('button', { name: 'Inner first' })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Inner second' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Inner first' })).toHaveFocus();
  });

  it('returns focus to whatever opened it', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open outer' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Close outer' }));
    expect(opener).toHaveFocus();
  });
});
