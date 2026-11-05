import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';

describe('App shell', () => {
  it('renders the connection flow and empty state without Web MIDI', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('microKORG');
    expect(html).toContain('Connect MIDI');
    expect(html).toContain('Dump current program');
    expect(html).toContain('No program loaded');
    expect(html).toContain('SystemEx = ENA');
  });

  it('offers an offline blank program before any dump', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Start with a blank program');
  });
});
