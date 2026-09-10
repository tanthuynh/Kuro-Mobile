/**
 * __tests__/crew-avatar-svg.test.tsx
 * Unit Tests for CrewAvatar SVG decoding & rendering.
 * Verifies robust decoding of percent-encoded, raw unencoded XML, charset prefixes,
 * base64 encoded SVGs, and graceful fallback to initials on corrupted data URIs without throwing URIError.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/context/theme-context';
import { CrewAvatar, parseSvgDataUri } from '../app/(tabs)/profile';

describe('CrewAvatar & parseSvgDataUri', () => {
  const renderAvatar = (ui: React.ReactElement) => {
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  };

  describe('parseSvgDataUri helper', () => {
    it('returns null for empty, non-string, or non-SVG data URIs', () => {
      expect(parseSvgDataUri(null)).toBeNull();
      expect(parseSvgDataUri(undefined)).toBeNull();
      expect(parseSvgDataUri('')).toBeNull();
      expect(parseSvgDataUri('https://example.com/photo.png')).toBeNull();
      expect(parseSvgDataUri('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    });

    it('decodes standard percent-encoded SVG data URIs', () => {
      const svg = '<svg width="50" height="50"><circle cx="25" cy="25" r="20"/></svg>';
      const encoded = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      const result = parseSvgDataUri(encoded);
      expect(result).toBe(svg);
    });

    it('safely handles unencoded SVG with % symbols (e.g. width="100%") without throwing URIError', () => {
      const rawSvgUri = 'data:image/svg+xml,<svg width="100%" height="100%"><rect fill="%23ff0000"/></svg>';
      expect(() => {
        const result = parseSvgDataUri(rawSvgUri);
        expect(result).toContain('<svg');
        expect(result).toContain('100%');
      }).not.toThrow();
    });

    it('safely handles charset and utf-8 prefixes in data URI header', () => {
      const rawSvgWithCharset = 'data:image/svg+xml;charset=utf-8,<svg width="100%" height="100%"><circle/></svg>';
      const rawSvgWithUtf8 = 'data:image/svg+xml;utf-8,<svg width="60" height="60"><circle/></svg>';

      expect(parseSvgDataUri(rawSvgWithCharset)).toContain('<svg');
      expect(parseSvgDataUri(rawSvgWithUtf8)).toContain('<svg');
    });

    it('decodes base64-encoded SVG data URIs', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
      const b64 = Buffer.from(svg).toString('base64');
      const b64Uri = `data:image/svg+xml;base64,${b64}`;

      const result = parseSvgDataUri(b64Uri);
      expect(result).toBe(svg);
    });

    it('gracefully handles malformed percent-encoded sequences without throwing URIError', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const malformedUri = 'data:image/svg+xml,%E0%A4%A'; // incomplete UTF-8 byte sequence

      expect(() => {
        const result = parseSvgDataUri(malformedUri);
        expect(result).toBeNull();
      }).not.toThrow();

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[CrewAvatar] SVG decode error'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });

    it('returns null when decoded content contains no <svg element', () => {
      const nonSvgData = 'data:image/svg+xml;utf8,hello world this is plain text';
      expect(parseSvgDataUri(nonSvgData)).toBeNull();
    });
  });

  describe('<CrewAvatar /> component rendering', () => {
    it('renders fallback initials when avatarUrl is undefined or null', () => {
      const { getByText } = renderAvatar(<CrewAvatar name="John Doe" />);
      expect(getByText('JD')).toBeTruthy();
    });

    it('renders fallback initials for single-word names', () => {
      const { getByText } = renderAvatar(<CrewAvatar name="Operator" />);
      expect(getByText('OP')).toBeTruthy();
    });

    it('renders fallback initials when avatarUrl is a malformed SVG URI without throwing', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { getByText } = renderAvatar(
        <CrewAvatar avatarUrl="data:image/svg+xml,malformed%99%ZZ%100%" name="Sarah Connor" />
      );

      expect(getByText('SC')).toBeTruthy();
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[CrewAvatar] SVG decode error'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });

    it('renders SVG successfully when avatarUrl contains width="100%" without warnings', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const unencodedSvg = 'data:image/svg+xml;utf-8,<svg width="100%" height="100%"><circle cx="10" cy="10" r="10"/></svg>';

      renderAvatar(
        <CrewAvatar avatarUrl={unencodedSvg} name="Miles Dyson" />
      );

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('renders raster photo image when given HTTP/HTTPS URL', () => {
      const { getByLabelText } = renderAvatar(
        <CrewAvatar avatarUrl="https://example.com/avatar.jpg" name="Alex Murphy" />
      );

      const image = getByLabelText('Alex Murphy');
      expect(image).toBeTruthy();
    });
  });
});
