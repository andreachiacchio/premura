import { describe, expect, it } from 'vitest';
import { extractPathFromPublicUrl } from '../lib/storage';

// Slice G — Test pure function extractPathFromPublicUrl.

describe('extractPathFromPublicUrl', () => {
  it('estrae path da URL property-photos', () => {
    const url =
      'https://xxxxx.supabase.co/storage/v1/object/public/property-photos/abc-123/photo.jpg';
    expect(extractPathFromPublicUrl('property-photos', url)).toBe('abc-123/photo.jpg');
  });

  it('estrae path da URL kit-setup-photos', () => {
    const url = 'https://xxxxx.supabase.co/storage/v1/object/public/kit-setup-photos/uuid.png';
    expect(extractPathFromPublicUrl('kit-setup-photos', url)).toBe('uuid.png');
  });

  it('ritorna null se URL bucket diverso', () => {
    const url = 'https://xxxxx.supabase.co/storage/v1/object/public/altro-bucket/file.jpg';
    expect(extractPathFromPublicUrl('property-photos', url)).toBeNull();
  });

  it('ritorna null se URL malformato', () => {
    expect(extractPathFromPublicUrl('property-photos', 'https://malformed')).toBeNull();
  });
});
