import { describe, expect, it } from 'vitest';
import { looksPrivate, parseMinutes } from '../src/lib/parse/layout.ts';
import { cleanText, initials, isOurTeam, isSubsetName, sameParts, slugify } from '../src/lib/names.ts';
import { parseVideo } from '../src/lib/video.ts';

describe('navn', () => {
  it('normaliserer ulike bindestreker', () => {
    expect(cleanText('Søgnen‐Fjellanger')).toBe('Søgnen-Fjellanger');
    expect(cleanText('Rød–Jensen  ')).toBe('Rød-Jensen');
  });

  it('sammenligner navn som mengder av navnedeler', () => {
    expect(sameParts('Tord Fares Jonsson Abd Rabo', 'Tord Fares Jonsson Abd Rabo')).toBe(true);
    expect(sameParts('Georg Søgnen‐Fjellanger', 'Georg Søgnen-Fjellanger')).toBe(true);
    expect(isSubsetName('Kay Magne Pedersen', 'Kay-Magne Larsen Pedersen')).toBe(true);
    expect(isSubsetName('Øystein Midtvik', 'Øystein Emdal Midtvik')).toBe(true);
    expect(isSubsetName('Tomas Emdal Midtvik', 'Øystein Emdal Midtvik')).toBe(false);
  });

  it('lager slugs og initialer', () => {
    expect(slugify('Arne Ravnå')).toBe('arne-ravna');
    expect(slugify('Øystein Emdal Midtvik')).toBe('oystein-emdal-midtvik');
    expect(slugify('Kristoffer Mørch Hobæk')).toBe('kristoffer-morch-hobaek');
    expect(initials('Ole Askevold Vaaler')).toBe('OV');
  });

  it('kjenner igjen vårt lag', () => {
    expect(isOurTeam('Djerv 2', 'Djerv 2')).toBe(true);
    expect(isOurTeam('Djerv 2 Blå', 'Djerv 2')).toBe(true);
    expect(isOurTeam('Djerv 20', 'Djerv 2')).toBe(false);
    expect(isOurTeam('Djerv', 'Djerv 2')).toBe(false);
  });
});

describe('minutter og personvern', () => {
  it('leser minutter', () => {
    const w: string[] = [];
    expect(parseMinutes('29, 80', (m) => w.push(m))).toEqual([29, 80]);
    expect(parseMinutes('94', (m) => w.push(m))).toEqual([94]);
    expect(parseMinutes('45+2', (m) => w.push(m))).toEqual([45]);
    expect(w).toHaveLength(1);
  });

  it('kjenner igjen telefonnummer og e-post, men ikke datoer og kampnummer', () => {
    expect(looksPrivate('Tlf 912 34 567')).toBe(true);
    expect(looksPrivate('+47 91234567')).toBe(true);
    expect(looksPrivate('ola@example.com')).toBe(true);
    expect(looksPrivate('28.10.2023 13:00')).toBe(false);
    expect(looksPrivate('Kampnr: 12120601129')).toBe(false);
  });
});

describe('video', () => {
  it('gjenkjenner YouTube-lenker', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=90',
    ]) {
      const v = parseVideo(u);
      expect(v.kind).toBe('youtube');
      if (v.kind === 'youtube') expect(v.id).toBe('dQw4w9WgXcQ');
    }
    const t = parseVideo('https://youtu.be/dQw4w9WgXcQ?t=1m30s');
    expect(t.kind === 'youtube' && t.start).toBe(90);
  });

  it('gjenkjenner Vimeo og vanlige lenker', () => {
    expect(parseVideo('https://vimeo.com/123456789').kind).toBe('vimeo');
    expect(parseVideo('https://example.com/video.mp4').kind).toBe('lenke');
    expect(parseVideo('ikke en url').kind).toBe('lenke');
  });
});
