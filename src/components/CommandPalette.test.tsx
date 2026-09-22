import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, type PalettePage } from './CommandPalette';

function page(onDone: (key: string) => void, onOpen: (key: string) => void): PalettePage {
  return {
    title: 'JiraPlay',
    placeholder: 'Jump…',
    commands: [
      {
        id: 'done',
        label: 'Mark an issue as done…',
        group: 'Actions',
        run: () => ({
          title: 'Mark done',
          placeholder: 'Which issue?',
          commands: [
            { id: 'issue:PD-1', label: 'Fix the login redirect', hint: 'PD-1', group: 'Issues', run: () => onDone('PD-1') },
            { id: 'issue:PD-2', label: 'Write the release notes', hint: 'PD-2', group: 'Issues', run: () => onDone('PD-2') },
          ],
        }),
      },
      { id: 'open:PD-2', label: 'Write the release notes', hint: 'PD-2', group: 'Issues', run: () => onOpen('PD-2') },
    ],
  };
}

describe('CommandPalette', () => {
  it('filters as you type and runs the highlighted command on Enter', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette root={page(vi.fn(), onOpen)} onClose={onClose} />);

    await user.keyboard('release');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('PD-2');
    expect(onClose).toHaveBeenCalled();
  });

  it('walks into a follow-up page with the arrows, and Escape steps back before it closes', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette root={page(onDone, vi.fn())} onClose={onClose} />);

    await user.keyboard('{Enter}');
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Which issue?');
    expect(screen.getAllByRole('option')).toHaveLength(2);

    // Escape on a follow-up page goes back rather than closing.
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Jump…');

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onDone).toHaveBeenCalledWith('PD-2');
  });

  it('closes on Escape from the first page and says so when nothing matches', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette root={page(vi.fn(), vi.fn())} onClose={onClose} />);

    await user.keyboard('zzzz');
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
