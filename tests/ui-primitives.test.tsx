// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table, Td, Th } from '@/components/ui/Table';
import { Chip } from '@/components/ui/Chip';
import { Status } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { Pagination } from '@/components/ui/Pagination';

/**
 * NG-2 — the behaviour the shared primitives promise and a class name cannot show: keyboard
 * paths, label wiring, and never leaving a state to colour alone. The look is measured in a real
 * browser (tests/e2e/design-system-preview.spec.ts); jsdom has no layout.
 */

beforeAll(() => {
  // jsdom has no showModal(); the real focus trap and Escape are covered in the e2e spec.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(cleanup);

describe('Button', () => {
  it('does not submit a surrounding form unless asked to', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('lets the caller opt in to submit', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('submit');
  });
});

describe('Input', () => {
  it('names the field from its label and describes it with the hint', () => {
    render(<Input label="Title" hint="Short" />);
    const field = screen.getByRole('textbox', { name: 'Title' });
    expect(field.getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById(field.getAttribute('aria-describedby') as string)?.textContent).toBe('Short');
  });

  it('marks an error on the field and announces it in place of the hint', () => {
    render(<Input label="Title" hint="Short" error="Required" />);
    const field = screen.getByRole('textbox', { name: 'Title' });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(field.getAttribute('aria-describedby') as string)?.textContent).toBe('Required');
    expect(screen.queryByText('Short')).toBeNull();
  });
});

describe('Table', () => {
  it('is a named, keyboard-scrollable region with column headers', () => {
    render(
      <Table caption="Calls">
        <thead>
          <tr>
            <Th>Name</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>A</Td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole('region', { name: 'Calls' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('table', { name: 'Calls' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('scope')).toBe('col');
  });
});

describe('Chip', () => {
  it('reports its selected state and toggles', () => {
    const onClick = vi.fn();
    render(
      <Chip selected onClick={onClick}>
        Open
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Open' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('offers a named remove button that does not trigger the chip itself', () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <Chip onClick={onClick} onRemove={onRemove} removeLabel="Remove Open">
        Open
      </Chip>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Open' }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is plain text without a handler', () => {
    render(<Chip>Open</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Open')).toBeTruthy();
  });
});

describe('Status', () => {
  it.each(['ok', 'warn', 'bad'] as const)('%s carries an icon next to its words, not colour alone', (tone) => {
    const { container } = render(<Status tone={tone}>Label</Status>);
    expect(screen.getByText('Label')).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('gives each tone its own icon', () => {
    const shape = (tone: 'ok' | 'warn' | 'bad') => {
      const { container, unmount } = render(<Status tone={tone}>Label</Status>);
      const html = container.querySelector('svg')?.innerHTML;
      unmount();
      return html;
    };
    expect(new Set([shape('ok'), shape('warn'), shape('bad')]).size).toBe(3);
  });
});

describe('Modal', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <Modal
          open={open}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          title="Heading"
          closeLabel="Close"
        >
          Body
        </Modal>
      </>
    );
  }

  it('opens on demand, is named by its title and reports the close', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(false);

    fireEvent.click(screen.getByText('open'));
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') as string)?.textContent).toBe('Heading');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'a', label: 'One', content: 'first' },
    { id: 'b', label: 'Two', content: 'second' },
    { id: 'c', label: 'Three', content: 'third' },
  ];

  it('wires each tab to its panel with one tab stop', () => {
    render(<Tabs label="Sections" items={items} />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const panel = screen.getByRole('tabpanel', { name: 'One' });
    expect(panel.textContent).toBe('first');
    expect(tabs[0]?.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('moves with the arrow keys, wraps, and honours Home and End', () => {
    render(<Tabs label="Sections" items={items} />);
    const key = (k: string) => fireEvent.keyDown(document.activeElement as Element, { key: k });
    (screen.getByRole('tab', { name: 'One' }) as HTMLElement).focus();

    key('ArrowLeft');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Three' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('third');

    key('ArrowRight');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }));

    key('End');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Three' }));

    key('Home');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }));
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Pagination', () => {
  const labels = { label: 'Pages', previousLabel: 'Previous', nextLabel: 'Next' };

  it('steps by one page', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...labels} page={2} totalPages={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('navigation', { name: 'Pages' }).textContent).toContain('2 / 3');
  });

  it('stays focusable at the edge, so a keyboard user does not lose their place, but does nothing', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...labels} page={3} totalPages={3} onPageChange={onPageChange} />);
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(next);
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
