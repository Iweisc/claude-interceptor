const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLegacySkillArchiveBuffer,
  buildLegacySkillDetail,
  mapLegacySkillRowToClaudeSkill,
  safeParseJsonResponse,
} = require('../inject.js');

test('mapLegacySkillRowToClaudeSkill normalizes old sync-server rows', () => {
  assert.deepEqual(
    mapLegacySkillRowToClaudeSkill({
      id: 'hello-world',
      name: 'hello-world',
      description: 'A hello world skill',
      prompt: 'Return hello world.',
      enabled: true,
      created_at: '2026-03-23T00:00:00.000Z',
    }),
    {
      id: 'hello-world',
      name: 'hello-world',
      description: 'A hello world skill',
      creator_type: 'user',
      updated_at: '2026-03-23T00:00:00.000Z',
      enabled: true,
      partition_by: 'user',
      is_public_provisioned: false,
      user_invocable: true,
      is_shared: false,
    }
  );
});

test('buildLegacySkillDetail synthesizes SKILL.md from prompt', () => {
  const detail = buildLegacySkillDetail({
    id: 'hello-world',
    name: 'hello-world',
    description: 'A hello world skill',
    prompt: 'Return hello world.',
    enabled: true,
  });

  assert.equal(detail.instructions, 'Return hello world.');
  assert.deepEqual(detail.files, [
    { path: 'SKILL.md', content: 'Return hello world.' },
  ]);
});

test('buildLegacySkillArchiveBuffer returns a zip buffer', () => {
  const archive = buildLegacySkillArchiveBuffer({
    prompt: 'Return hello world.',
  });

  assert.ok(Buffer.isBuffer(Buffer.from(archive)));
  assert.equal(Buffer.from(archive).subarray(0, 4).toString('hex'), '504b0304');
});

test('safeParseJsonResponse returns null for html responses', async () => {
  const response = new Response('<!DOCTYPE html><html></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

  assert.equal(await safeParseJsonResponse(response), null);
});
