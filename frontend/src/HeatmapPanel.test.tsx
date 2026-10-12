import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeatmapPanel } from './App';
import { apiFetch } from './lib/api';

vi.mock('./lib/api', () => ({
  API_BASE: 'http://localhost:5000/api',
  apiFetch: vi.fn(),
}));

describe('HeatmapPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when the selected page has no clicks', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: [],
      total: 0,
      sessions: 0,
      invalidCoordinates: 0,
      viewportBreakdown: [],
      selectedViewport: null,
    });

    render(<HeatmapPanel refreshToken={0} range="all" />);

    expect(screen.getByRole('combobox', { name: 'Heatmap page' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No valid clicks yet for this page and viewport.')).toBeInTheDocument());
  });

  it('selects and requests a single viewport cohort instead of mixing screen sizes', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: [],
      total: 10,
      sessions: 5,
      invalidCoordinates: 1,
      viewportBreakdown: [
        { viewportWidth: 1280, viewportHeight: 800, clicks: 8, sessions: 4 },
        { viewportWidth: 390, viewportHeight: 844, clicks: 2, sessions: 1 },
      ],
      selectedViewport: { viewportWidth: 1280, viewportHeight: 800 },
    });

    render(<HeatmapPanel refreshToken={0} range="all" />);

    const viewportSelect = screen.getByRole('combobox', { name: 'Heatmap viewport' });
    await waitFor(() => expect(viewportSelect).toHaveValue('1280x800'));

    fireEvent.change(viewportSelect, { target: { value: '390x844' } });
    await waitFor(() => {
      expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url.includes('viewportWidth=390&viewportHeight=844'))).toBe(true);
    });
    expect(screen.getByText(/1 click events excluded/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Heatmap page' }), {
      target: { value: `${window.location.origin}/store` },
    });
    await waitFor(() => {
      expect(vi.mocked(apiFetch).mock.calls.some(([url]) => url.includes(encodeURIComponent(`${window.location.origin}/store`)))).toBe(true);
    });
  });

  it('shows a visible error state when the heatmap API fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('API unavailable'));

    render(<HeatmapPanel refreshToken={0} range="all" />);

    await waitFor(() => expect(screen.getByText(/Could not load heatmap: API unavailable/)).toBeInTheDocument());
  });
});
