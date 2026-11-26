import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./scene/Microscope', () => ({ Microscope: () => <div data-testid="scene" /> }));

import { App } from './App';

describe('App', () => {
  it('shows disclaimer, aperture overlay and scene', () => {
    render(<App />);
    expect(screen.getByText(/educational use only/i)).toBeTruthy();
    expect(screen.getByTestId('aperture')).toBeTruthy();
    expect(screen.getByTestId('scene')).toBeTruthy();
  });
});
