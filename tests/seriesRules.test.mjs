import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesTotals, isStudentClass } from '../src/lib/seriesRules.js';
test('Schüler: vier Langsamlaufserien ohne Schnelllauf', () => {
  assert.deepEqual(seriesTotals({s1:80,s2:90,s3:95,s4:85,s5:99,s6:99}, 'Schüler'), {ll:350,sl:0,gesamt:350});
  assert.deepEqual(seriesTotals({s1:100,s2:100,s3:100,s4:100}, 'Schüler'), {ll:400,sl:0,gesamt:400});
  assert.equal(isStudentClass(' Schüler '), true);
});
test('Andere Klassen behalten drei LL- und drei SL-Serien', () => {
  assert.deepEqual(seriesTotals({s1:80,s2:90,s3:95,s4:85,s5:91,s6:89}, 'Herren'), {ll:265,sl:265,gesamt:530});
});
