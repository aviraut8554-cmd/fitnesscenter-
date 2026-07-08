import { describe, it, expect } from 'vitest';
import { parseCsv, rowsToClients } from '@/lib/csv';

describe('parseCsv', () => {
  it('parses simple rows and strips BOM', () => {
    const rows = parseCsv('\uFEFFname,email\nAarav,aarav@example.com\n');
    expect(rows).toEqual([
      ['name', 'email'],
      ['Aarav', 'aarav@example.com'],
    ]);
  });

  it('handles quoted fields with commas, quotes and newlines', () => {
    const rows = parseCsv('name,notes\n"Doe, Jane","Says ""hi""\nsecond line"');
    expect(rows).toEqual([
      ['name', 'notes'],
      ['Doe, Jane', 'Says "hi"\nsecond line'],
    ]);
  });

  it('supports CRLF line endings and drops blank rows', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('rowsToClients', () => {
  it('maps header aliases to client fields in file order', () => {
    const rows = parseCsv(
      'Full Name,Email Address,Phone,Status\nAarav,aarav@example.com,+91 90000 00000,active\nDiya,diya@example.com,,\n',
    );
    expect(rowsToClients(rows)).toEqual([
      { fullName: 'Aarav', email: 'aarav@example.com', phone: '+91 90000 00000', status: 'active' },
      { fullName: 'Diya', email: 'diya@example.com' },
    ]);
  });

  it('ignores unknown columns and returns empty for header-only files', () => {
    expect(rowsToClients(parseCsv('name,email\n'))).toEqual([]);
    const rows = parseCsv('name,favourite_colour\nAarav,blue\n');
    expect(rowsToClients(rows)).toEqual([{ fullName: 'Aarav', email: '' }]);
  });
});
