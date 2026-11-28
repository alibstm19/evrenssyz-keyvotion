'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addTeamActivity, teamTasks } = require('../../src/renderer/team-activity.js');

test('team activity preserves the session reference and omits raw event details', () => {
  const at = '2026-01-01T12:00:00Z';
  const event = { type: 'session.tool.success', at, data: { sessionID: 'session-1', output: 'private' } };
  assert.deepEqual(addTeamActivity([], event), [{
    label: 'Araç tamamlandı', sessionId: 'session-1', at: Date.parse(at)
  }]);

  const existing = addTeamActivity([], event);
  assert.equal(addTeamActivity(existing, { type: 'session.text.delta' }), existing);
  assert.equal(addTeamActivity(Array(60).fill(existing[0]), event).length, 60);
});

test('team tasks show active and blocked board work for the assigned role', () => {
  const rows = [
    { id: 'T-1', owner: 'DEV', status: 'devam' },
    { id: 'T-2', owner: ' dev ', status: 'bloke' },
    { id: 'T-3', owner: 'DEV', status: 'bitti' },
    { id: 'T-4', owner: 'QA', status: 'devam' }
  ];
  assert.deepEqual(teamTasks(rows, 'DEV').map(({ id }) => id), ['T-1', 'T-2']);
});
