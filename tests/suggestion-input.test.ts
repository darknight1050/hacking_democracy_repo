import test from 'node:test';
import assert from 'node:assert/strict';
import { readSuggestionForm } from '../src/server/suggestion-input';
function request(fields: Record<string, string | undefined> = {}) {
  const data = new FormData();
  const values = {
    title: 'A neighbourhood garden',
    description: 'A welcoming garden for the whole neighbourhood.',
    districtId: '1',
    cost: '1500',
    categoryIds: '1',
    ...fields,
  };
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value);
  return new Request('http://test/api/suggestions', { method: 'POST', body: data });
}
test('suggestions require explicit valid costs', async () => {
  for (const cost of [undefined, '', '0', '-2', '1.5', 'NaN', '1000000001'])
    await assert.rejects(readSuggestionForm(request({ cost })));
});
test('locations validate pairs and distinguish omitted values from explicit removal', async () => {
  const input = await readSuggestionForm(
    request({ location: '  Lindenhof  ', latitude: '47.373', longitude: '8.541' }),
  );
  assert.equal(input.location, 'Lindenhof');
  assert.equal(input.latitude, 47.373);
  assert.equal(input.longitude, 8.541);
  const empty = await readSuggestionForm(request({ location: '', latitude: '', longitude: '' }));
  assert.equal(empty.location, null);
  assert.equal(empty.latitude, null);
  assert.equal(empty.longitude, null);
  assert.equal((await readSuggestionForm(request())).latitude, undefined);
  for (const fields of [
    { latitude: '47' },
    { latitude: '47', longitude: '' },
    { latitude: '91', longitude: '8' },
    { latitude: '47', longitude: '181' },
    { location: 'x'.repeat(301) },
  ])
    await assert.rejects(readSuggestionForm(request(fields)));
});
