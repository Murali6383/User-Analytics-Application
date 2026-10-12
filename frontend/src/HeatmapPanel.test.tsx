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

  it('renders a real viewport click at its scroll-adjusted full-page position', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: [
        {
          _id: 'stored-click-1',
          eventType: 'click',
          clickX: 100,
          clickY: 120,
          coordinateMode: 'viewport',
          scrollX: 0,
          scrollY: 200,
          viewportWidth: 800,
          viewportHeight: 600,
          documentWidth: 800,
          documentHeight: 1280,
        },
      ],
      total: 1,
      sessions: 1,
      invalidCoordinates: 0,
      viewportBreakdown: [{ viewportWidth: 800, viewportHeight: 600, clicks: 1, sessions: 1 }],
      selectedViewport: { viewportWidth: 800, viewportHeight: 600 },
    });

    render(<HeatmapPanel refreshToken={0} range="all" />);

    const dot = await screen.findByTitle('1 stored click at 100, 120 CSS pixels');
    expect(dot).toHaveStyle({ left: '12.5%', top: '25%' });
    expect(screen.getByText(/800 × 600 CSS-pixel viewport/)).toBeInTheDocument();
  });

  it('clears the viewport cohort when the active date range has no matching clicks', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        data: [],
        total: 3,
        sessions: 2,
        invalidCoordinates: 0,
        viewportBreakdown: [{ viewportWidth: 1280, viewportHeight: 800, clicks: 3, sessions: 2 }],
        selectedViewport: { viewportWidth: 1280, viewportHeight: 800 },
      })
      .mockResolvedValueOnce({
        data: [],
        total: 0,
        sessions: 0,
        invalidCoordinates: 0,
        viewportBreakdown: [],
        selectedViewport: null,
      });

    const { rerender } = render(<HeatmapPanel refreshToken={0} range="all" />);
    const viewportSelect = screen.getByRole('combobox', { name: 'Heatmap viewport' });
    await waitFor(() => expect(viewportSelect).toHaveValue('1280x800'));

    rerender(<HeatmapPanel refreshToken={1} range="7d" />);

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Heatmap viewport' })).toHaveValue(''));
    expect(screen.getByText('No valid clicks yet for this page and viewport.')).toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain('from=');
  });
});
