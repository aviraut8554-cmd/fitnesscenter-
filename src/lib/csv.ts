/**
 * Minimal RFC-4180-ish CSV parser used for bulk client import in the browser.
 * Handles quoted fields, embedded commas/newlines, escaped double-quotes ("")
 * and CRLF/CR line endings. Blank rows are dropped. Kept dependency-free.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, ''); // strip BOM

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c === '\r') {
      /* swallow; the following \n (if any) ends the row */
      if (s[i + 1] !== '\n') endRow();
    } else field += c;
  }
  // trailing field/row without a terminating newline
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export type ClientCsvRow = {
  fullName: string;
  email: string;
  phone?: string;
  status?: string;
};

const HEADER_ALIASES: Record<string, keyof ClientCsvRow> = {
  name: 'fullName',
  'full name': 'fullName',
  fullname: 'fullName',
  client: 'fullName',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  status: 'status',
};

/**
 * Map parsed CSV rows to client objects using a header row. Recognises common
 * column names (name/full name, email, phone, status). Rows are returned in
 * file order; validation of individual fields happens server-side.
 */
export function rowsToClients(rows: string[][]): ClientCsvRow[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const cols = header.map((h) => HEADER_ALIASES[h]);
  return rows.slice(1).map((r) => {
    const obj: ClientCsvRow = { fullName: '', email: '' };
    cols.forEach((key, idx) => {
      if (!key) return;
      const val = (r[idx] ?? '').trim();
      if (val) obj[key] = val;
    });
    return obj;
  });
}
