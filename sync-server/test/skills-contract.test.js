const test = require('node:test');
const assert = require('node:assert/strict');

const JSZip = require('jszip');
const {
  buildSkillArchive,
  buildSkillFiles,
  extractSkillArchive,
  inferSkillNameFromFilename,
  mapSkillRowToClaudeSkill,
} = require('../skills');

test('mapSkillRowToClaudeSkill returns Claude-compatible metadata', () => {
  const skill = mapSkillRowToClaudeSkill({
    id: 'skill-creator',
    name: 'skill-creator',
    description: 'Create skills',
    prompt: 'Return a valid skill.',
    enabled: true,
    creator_type: 'user',
    partition_by: 'user',
    is_public_provisioned: false,
    user_invocable: true,
    is_shared: false,
    updated_at: '2026-03-22T00:00:00.000Z',
  });

  assert.deepEqual(skill, {
    id: 'skill-creator',
    name: 'skill-creator',
    description: 'Create skills',
    creator_type: 'user',
    updated_at: '2026-03-22T00:00:00.000Z',
    enabled: true,
    partition_by: 'user',
    is_public_provisioned: false,
    user_invocable: true,
    is_shared: false,
  });
});

test('buildSkillFiles always includes SKILL.md from stored instructions', () => {
  const files = buildSkillFiles({
    name: 'hello-world',
    description: 'Returns hello world.',
    prompt: 'Return hello world.',
  });

  assert.deepEqual(files, [
    {
      path: 'SKILL.md',
      content: 'Return hello world.',
    },
  ]);
});

test('buildSkillArchive creates a .skill zip with SKILL.md', async () => {
  const archive = await buildSkillArchive({
    name: 'hello-world',
    description: 'Returns hello world.',
    prompt: 'Return hello world.',
  });
  const zip = await JSZip.loadAsync(archive);
  const entry = zip.file('SKILL.md');

  assert.ok(entry, 'expected SKILL.md in skill archive');
  assert.equal(await entry.async('string'), 'Return hello world.');
});

test('extractSkillArchive returns files and SKILL.md instructions', async () => {
  const zip = new JSZip();
  zip.file('SKILL.md', 'Return hello world.');
  zip.file('templates/example.txt', 'template body');

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const extracted = await extractSkillArchive(archive);

  assert.equal(extracted.instructions, 'Return hello world.');
  assert.deepEqual(extracted.files, [
    { path: 'SKILL.md', content: 'Return hello world.' },
    { path: 'templates/example.txt', content: 'template body' },
  ]);
});

test('inferSkillNameFromFilename strips extension and directories', () => {
  assert.equal(inferSkillNameFromFilename('/tmp/my-skill.skill'), 'my-skill');
});
