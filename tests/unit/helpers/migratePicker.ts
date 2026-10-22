import { expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

const pickerButton = () => screen.findByRole('button', { name: 'Migrate options' });

export async function openMigratePicker(user: User): Promise<HTMLElement> {
  const button = await pickerButton();
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button);
  return screen.getByRole('listbox', { name: 'Migrate options' });
}

const boxes = (list: HTMLElement) => Array.from(list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

export async function migrateOptionLabels(user: User): Promise<string[]> {
  const list = await openMigratePicker(user);
  await waitFor(() => expect(boxes(list).length).toBeGreaterThan(0));
  const labels = boxes(list).map(b => (b.closest('label')?.textContent || '').trim());
  await user.keyboard('{Escape}');
  return labels;
}

// Ticked option values, in list order.
export async function migrateSelectedValues(user: User): Promise<string[]> {
  const list = await openMigratePicker(user);
  const values = boxes(list).filter(b => b.checked).map(b => b.dataset.value || '');
  await user.keyboard('{Escape}');
  return values;
}

// Ticks or unticks one option, leaving the others as they are.
export async function toggleMigrateOption(user: User, value: string): Promise<void> {
  const list = await openMigratePicker(user);
  const box = await waitFor(() => {
    const match = boxes(list).find(b => b.dataset.value === value);
    if (!match) throw new Error(`Migrate list has no ${value}`);
    return match;
  });
  await user.click(box);
  await user.keyboard('{Escape}');
}

// The old single-choice dropdown: leaves only `value` ticked ('' unticks everything).
export async function chooseMigrateOnly(user: User, value: string): Promise<void> {
  let list = await openMigratePicker(user);
  if (value) {
    await waitFor(() => {
      if (!boxes(list).some(b => b.dataset.value === value)) throw new Error(`Migrate list has no ${value}`);
    });
  }
  // Untick first so the change never passes through a combined quote.
  for (;;) {
    const ticked = boxes(list).find(b => b.checked && b.dataset.value !== value);
    if (!ticked) break;
    await user.click(ticked);
    list = await openMigratePicker(user);
  }
  const target = boxes(list).find(b => b.dataset.value === value);
  if (target && !target.checked) await user.click(target);
  await user.keyboard('{Escape}');
}
