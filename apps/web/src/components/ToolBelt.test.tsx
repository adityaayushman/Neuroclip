import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../scene/Microscope', () => ({ Microscope: () => <div /> }));

import { App } from '../App';
import { TOOL_LIST } from '../tools/toolDefs';

afterEach(cleanup);

describe('tool belt', () => {
  it('keys 1-0 select tools and the UI updates within 50 ms', () => {
    render(<App />);
    for (const t of TOOL_LIST) {
      const t0 = performance.now();
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: t.key }));
      });
      const ms = performance.now() - t0;
      expect(screen.getByTestId(`tool-${t.id}`).getAttribute('aria-pressed')).toBe('true');
      expect(ms).toBeLessThan(50);
    }
    expect(screen.getByTestId('doppler')).toBeTruthy();
  });

  it('click selects a tool', () => {
    render(<App />);
    act(() => screen.getByTestId('tool-bipolar').click());
    expect(screen.getByTestId('tool-bipolar').getAttribute('aria-pressed')).toBe('true');
  });
});
