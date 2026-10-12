import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the dashboard shell', () => {
    render(<App />);
    expect(screen.getAllByText(/InsightTrack/i).length).toBeGreaterThan(0);
  });
});
