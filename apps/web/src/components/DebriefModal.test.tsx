import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRun } from '../state/run';
import { DebriefModal } from './DebriefModal';

const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

afterEach(() => {
  cleanup();
  useRun.setState({ phase: 'idle', debrief: null, leaderboard: [], error: null, mlSkill: null });
});

describe('DebriefModal', () => {
  it('renders nothing when idle', () => {
    render(<DebriefModal />);
    expect(screen.queryByTestId('debrief')).toBeNull();
  });

  it('asks for a name when finishing', () => {
    render(<DebriefModal />);
    act(() => useRun.setState({ phase: 'naming' }));
    expect(screen.getByTestId('name-input')).toBeTruthy();
    expect((screen.getByTestId('save-run') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows score, breakdown, blood loss and highlights the player on the leaderboard', () => {
    render(<DebriefModal />);
    act(() =>
      useRun.setState({
        phase: 'done',
        debrief: {
          run_id: uuid, mode: 'guided', status: 'finished', score: 777,
          breakdown: { completion: 400, safety: 200, blood: 100, efficiency: 77 },
          summary: {
            duration_ms: 125000, steps_completed: 6, errors: [{ t: 5000, step: 'dural_opening', tool: 'microscissors', code: 'vessel_nick', severity: 'rupture' }],
            timeline: [{ step: 'dural_opening', start_ms: 0, duration_ms: 65000, completed: true }],
            alarms: 1, ruptures: 1, blood_loss_ml: 1400, max_icp: 27, min_sbp: 62,
          },
          flagged: false, flags: [], ml_skill: null, rank: 2,
        },
        mlSkill: 0.62,
        leaderboard: [
          { rank: 1, display_name: 'Ada', score: 900, duration_ms: 90000, mode: 'guided', run_id: '00000000-0000-4000-8000-000000000000' },
          { rank: 2, display_name: 'You', score: 777, duration_ms: 125000, mode: 'guided', run_id: uuid },
        ],
      }),
    );
    expect(screen.getByTestId('score').textContent).toContain('777');
    expect(screen.getByTestId('rank').textContent).toContain('#2');
    expect(screen.getByTestId('blood-estimate').textContent).toContain('1400');
    expect(screen.getByTestId('ml-skill').textContent).toContain('62%');
    expect(screen.getByText(/vessel_nick/)).toBeTruthy();
    expect(screen.getByText('Dural opening', { exact: false })).toBeTruthy();
    const rows = screen.getByTestId('leaderboard').querySelectorAll('tr');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.className).toContain('bg-sky-900');
  });

  it('shows the error and offers retry', () => {
    render(<DebriefModal />);
    act(() => useRun.setState({ phase: 'error', error: 'Cannot reach the server' }));
    expect(screen.getByText('Cannot reach the server')).toBeTruthy();
    expect(screen.getByTestId('save-run').textContent).toBe('Retry');
  });
});
