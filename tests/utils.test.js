import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeStudentId,
    buildStudentDocId,
    parseStudentsFromText,
    arrayBufferToBase64
} from '../src/utils.js';

test('normalizeStudentId trims whitespace and uppercases characters', () => {
    assert.equal(normalizeStudentId('  a123  '), 'A123');
    assert.equal(normalizeStudentId('p 15 1038444'), 'P151038444');
});

test('normalizeStudentId returns empty string for nullish values', () => {
    assert.equal(normalizeStudentId(null), '');
    assert.equal(normalizeStudentId(undefined), '');
});

test('buildStudentDocId produces stable keys and strips unsafe characters', () => {
    const docId = buildStudentDocId('8', '2', 'A17-0035490');
    assert.equal(docId, '8-2-A17-0035490');

    const docIdWithSpaces = buildStudentDocId('9', '1', ' a17 0035 490 ');
    assert.equal(docIdWithSpaces, '9-1-A170035490');
});

test('buildStudentDocId returns empty string when grade or group missing', () => {
    assert.equal(buildStudentDocId('', '1', 'A170035490'), '');
    assert.equal(buildStudentDocId('8', '', 'A170035490'), '');
    assert.equal(buildStudentDocId('8', '1', ''), '');
});

test('parseStudentsFromText extracts unique students with normalized ids', () => {
    const sample = `\n سهيل الدقداق A161048373\n نوفل أمثيو A161050278 \n سهيل الدقداق A161048373\n`;
    const parsed = parseStudentsFromText(sample);
    assert.deepEqual(parsed, [
        { name: 'سهيل الدقداق', studentId: 'A161048373' },
        { name: 'نوفل أمثيو', studentId: 'A161050278' }
    ]);
});

test('arrayBufferToBase64 falls back to Buffer encoding in Node', () => {
    const bytes = Uint8Array.from([72, 101, 108, 108, 111]); // "Hello"
    const encoded = arrayBufferToBase64(bytes.buffer);
    assert.equal(encoded, 'SGVsbG8=');
});
