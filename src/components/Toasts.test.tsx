import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toasts, type Toast } from './Toasts';

const toast = (overrides: Partial<Toast> = {}): Toast => ({
  id: 1,
  text: 'Marked PD-1 as done',
  tone: 'info',
  durationMs: 6000,
  ...overrides,
});

// The whole point of a toast is when it goes away, so the clock is the thing under test.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('Toasts', () => {
  it('announces errors assertively and everything else politely', () => {
    const { rerender } = render(<Toasts toasts={[toast()]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<Toasts toasts={[toast({ tone: 'error' })]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('closes itself once its duration is up', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[toast({ durationMs: 5000 })]} onDismiss={onDismiss} />);

    tick(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    tick(1);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('holds while the pointer is over it, so an Undo is not snatched away', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[toast({ durationMs: 5000 })]} onDismiss={onDismiss} />);

    fireEvent.mouseEnter(screen.getByRole('status'));
    tick(20000);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(screen.getByRole('status'));
    tick(5000);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('also holds while something inside it has keyboard focus', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[toast({ durationMs: 5000, action: { label: 'Undo', onAction: vi.fn() } })]} onDismiss={onDismiss} />);

    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    tick(20000);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => screen.getByRole('button', { name: 'Undo' }).blur());
    tick(5000);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('runs the action and closes when Undo is pressed', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(<Toasts toasts={[toast({ action: { label: 'Undo', onAction } })]} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('has a dismiss control of its own', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[toast()]} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });
});
