import { ImageResponse } from 'next/og';

// og:image di sito (convenzione Next: vale anche come twitter:image per
// la card summary_large_image). Generata a build: palette della landing
// (ivory / ink / terracotta), missione in grande. Niente asset esterni.

export const alt = 'Premura — Un host AI accanto a ogni ospite, per tutto il soggiorno.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#F5EFE4',
        padding: '72px 80px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 9999,
            backgroundColor: '#C65D3A',
          }}
        />
        <div style={{ fontSize: 40, fontWeight: 700, color: '#1F3A4D' }}>Premura</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 68,
            lineHeight: 1.12,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            maxWidth: 1000,
          }}
        >
          <div style={{ color: '#1F3A4D' }}>Un host AI accanto a ogni ospite,</div>
          <div style={{ color: '#C65D3A' }}>per tutto il soggiorno.</div>
        </div>
        <div style={{ fontSize: 32, color: '#4A5F72' }}>
          Ascolta, capisce, agisce — anche alle due di notte.
        </div>
      </div>

      <div style={{ fontSize: 28, color: '#4A5F72' }}>premura.it</div>
    </div>,
    { ...size },
  );
}
