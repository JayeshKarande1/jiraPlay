import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../../shared/heroes';
import { AssignPicker } from './AssignPicker';

const member = (id: string, name: string): Member => ({
  hero: { id, name, avatarUrl: null },
  cls: { name: 'Knight', icon: '🛡️', color: '#fbbf24' },
  isTavern: false,
  quests: [],
  xp: 0,
  progress: null,
  earnedClass: false,
});

const MEMBERS = [member('a', 'Ada'), member('b', 'Brendan'), member('c', 'Grace')];

/** The picker as it is used: inside a dialog that also closes on Escape. */
function InDialog({ onAssign }: { onAssign: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return <p>dialog closed</p>;
  return (
    <div role="dialog" aria-label="Issue" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <AssignPicker members={MEMBERS} currentId="a" onAssign={onAssign} />
    </div>
  );
}

const openMenu = async () => userEvent.click(screen.getByRole('button', { name: /assign to someone else/i }));

describe('AssignPicker', () => {
  it('is the keyboard route to what dragging does', async () => {
    const onAssign = vi.fn();
    render(<InDialog onAssign={onAssign} />);
    await openMenu();

    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Focus starts on whoever has the issue now.
    expect(screen.getByRole('menuitemradio', { name: /Ada/ })).toHaveFocus();
    expect(screen.getByRole('menuitemradio', { name: /Ada/ })).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Brendan/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: /Grace/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Ada/ })).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onAssign).not.toHaveBeenCalled(); // Ada already has it.
  });

  it('hands the issue over and closes', async () => {
    const onAssign = vi.fn();
    render(<InDialog onAssign={onAssign} />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Grace/ }));

    expect(onAssign).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes just the menu on Escape, not the dialog behind it', async () => {
    render(<InDialog onAssign={vi.fn()} />);
    await openMenu();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('dialog closed')).not.toBeInTheDocument();
    // Focus goes back to the trigger, not nowhere.
    expect(screen.getByRole('button', { name: /assign to someone else/i })).toHaveFocus();
  });
});
