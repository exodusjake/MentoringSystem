const assert = require('node:assert/strict');
const test = require('node:test');

test('CSV parser supports quoted commas, escaped quotes, CRLF, and embedded newlines', async () => {
  const { parseCsv } = await import('../src/lib/csv.js');
  assert.deepEqual(
    parseCsv('Name,Note\r\n"Doe, Jane","said ""hello"""\r\n"line one\nline two",end\r\n'),
    [['Name', 'Note'], ['Doe, Jane', 'said "hello"'], ['line one\nline two', 'end']],
  );
});

test('CSV parser rejects an unclosed quoted field', async () => {
  const { parseCsv } = await import('../src/lib/csv.js');
  assert.throws(() => parseCsv('Name,Note\nJane,"unfinished'), /unclosed quoted field/);
});

test('CSV serializer quotes fields and prevents spreadsheet formula execution', async () => {
  const { serializeCsv } = await import('../src/lib/csv.js');
  assert.equal(
    serializeCsv([['Name', 'Value'], ['Jane "J"', '=1+1'], ['A, B', '-SUM(A1:A2)']]),
    '"Name","Value"\r\n"Jane ""J""","\'=1+1"\r\n"A, B","\'-SUM(A1:A2)"',
  );
});
