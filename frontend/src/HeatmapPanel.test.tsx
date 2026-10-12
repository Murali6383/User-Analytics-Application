import { render, screen, waitFor } from '@testing-library/react';
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
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total: 0 });

    render(<HeatmapPanel refreshToken={0} range="all" />);

    expect(screen.getByRole('combobox', { name: 'Heatmap page' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No clicks yet for this page.')).toBeInTheDocument());
  });
});
