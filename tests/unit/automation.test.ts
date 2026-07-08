import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TRIGGERS,
  DEFAULT_TEMPLATES,
  renderTemplate,
  TRIGGER_VARIABLES,
} from '@/lib/automation';

describe('renderTemplate', () => {
  it('substitutes known tokens', () => {
    expect(renderTemplate('Hi {{clientName}}!', { clientName: 'Aarav' })).toBe('Hi Aarav!');
  });

  it('tolerates surrounding whitespace in tokens', () => {
    expect(renderTemplate('{{ name }}', { name: 'X' })).toBe('X');
  });

  it('replaces unknown tokens with empty string', () => {
    expect(renderTemplate('Hi {{missing}}.', {})).toBe('Hi .');
  });

  it('replaces every occurrence', () => {
    expect(renderTemplate('{{a}}-{{a}}', { a: '1' })).toBe('1-1');
  });

  it('leaves plain text untouched', () => {
    expect(renderTemplate('no tokens here', { a: '1' })).toBe('no tokens here');
  });
});

describe('default templates', () => {
  it('provides a non-empty body for every trigger', () => {
    for (const trigger of AUTOMATION_TRIGGERS) {
      expect(DEFAULT_TEMPLATES[trigger].body.length).toBeGreaterThan(0);
    }
  });

  it('only references documented tokens for each trigger', () => {
    for (const trigger of AUTOMATION_TRIGGERS) {
      const allowed = new Set(TRIGGER_VARIABLES[trigger]);
      const tpl = DEFAULT_TEMPLATES[trigger];
      const used = [...`${tpl.subject ?? ''} ${tpl.body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(
        (m) => m[1],
      );
      for (const token of used) {
        expect(allowed.has(token), `${trigger} uses undocumented token {{${token}}}`).toBe(true);
      }
    }
  });
});
