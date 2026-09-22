import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeQuest } from '../../shared/testing';
import { QuestItem } from './QuestItem';

function renderRow(quest = makeQuest(), showStatus = false) {
  const onOpen = vi.fn();
  const onComplete = vi.fn();
  const view = render(
    <ul>
      <QuestItem quest={quest} showStatus={showStatus} onOpen={onOpen} onComplete={onComplete} />
    </ul>,
  );
  return { ...view, onOpen, onComplete };
}

describe('QuestItem', () => {
  it('gives the keyboard a button for the summary and one for marking done', async () => {
    const { onOpen, onComplete } = renderRow(makeQuest({ key: 'PD-7', summary: 'Fix the boss fight' }));

    await userEvent.click(screen.getByRole('button', { name: 'Fix the boss fight' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Mark PD-7 as done' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not also open the issue when the done button is used', async () => {
    // The whole row opens the issue on click, so the done button has to stop the event reaching it.
    const { onOpen, onComplete } = renderRow(makeQuest({ key: 'PD-8' }));

    await userEvent.click(screen.getByRole('button', { name: 'Mark PD-8 as done' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('labels the difficulty stars for a screen reader, and says where they came from', () => {
    renderRow(makeQuest({ points: 3 }));
    expect(screen.getByRole('img', { name: /Difficulty \d\/\d, .*point/ })).toBeInTheDocument();
  });

  it('replaces the done button with a labelled mark once the issue is done', () => {
    renderRow(makeQuest({ key: 'PD-9', done: true, stage: 'done', status: 'Done' }));
    expect(screen.queryByRole('button', { name: /Mark .* as done/ })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'PD-9 is done' })).toBeInTheDocument();
  });

  it('carries the due date as text, so the glyph beside it is decoration only', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { container } = renderRow(makeQuest({ dueDate: iso }));
    expect(screen.getByText('today')).toBeInTheDocument();
    // The themed clock glyph must not be announced alongside it.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
