const JSZip = require('jszip');

const MAX_SKILL_NAME_LENGTH = 120;
const MAX_SKILL_DESCRIPTION_LENGTH = 2000;
const MAX_SKILL_INSTRUCTIONS_LENGTH = 200000;
const MAX_SKILL_FILE_PATH_LENGTH = 256;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugifySkillName(name) {
  return normalizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isValidSkillId(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,127})$/.test(value);
}

function isValidPartition(value) {
  return value === 'user' || value === 'organization';
}

function sanitizeSkillFile(file) {
  if (!file || typeof file !== 'object') return null;

  const path = normalizeText(file.path);
  const content = typeof file.content === 'string' ? file.content : '';

  if (!path || path.length > MAX_SKILL_FILE_PATH_LENGTH) return null;
  if (path.startsWith('/') || path.includes('..')) return null;

  return { path, content };
}

function buildSkillFiles(skill) {
  const files = Array.isArray(skill?.files)
    ? skill.files.map(sanitizeSkillFile).filter(Boolean)
    : [];

  if (files.length > 0) {
    return files;
  }

  return [{
    path: 'SKILL.md',
    content: typeof skill?.prompt === 'string' ? skill.prompt : '',
  }];
}

async function extractSkillArchive(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = [];

  for (const path of Object.keys(zip.files).sort()) {
    const entry = zip.files[path];
    if (entry.dir) continue;

    const sanitized = sanitizeSkillFile({
      path,
      content: await entry.async('string'),
    });
    if (sanitized) files.push(sanitized);
  }

  const skillFile = files.find((file) => file.path === 'SKILL.md');
  if (!skillFile) {
    throw new Error('SKILL.md is required');
  }

  return {
    files,
    instructions: skillFile.content,
  };
}

function mapSkillRowToClaudeSkill(row) {
  const updatedAt = row?.updated_at || row?.created_at || new Date().toISOString();

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    creator_type: row.creator_type || 'user',
    updated_at: updatedAt,
    enabled: row.enabled !== false,
    partition_by: isValidPartition(row.partition_by) ? row.partition_by : 'user',
    is_public_provisioned: row.is_public_provisioned === true,
    user_invocable: row.user_invocable !== false,
    is_shared: row.is_shared === true,
  };
}

function buildSkillDetail(row) {
  return {
    ...mapSkillRowToClaudeSkill(row),
    instructions: typeof row.prompt === 'string' ? row.prompt : '',
    prompt: typeof row.prompt === 'string' ? row.prompt : '',
    files: buildSkillFiles(row),
  };
}

async function buildSkillArchive(skill) {
  const zip = new JSZip();

  for (const file of buildSkillFiles(skill)) {
    zip.file(file.path, file.content);
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function validateSimpleSkillInput(input) {
  const name = normalizeText(input?.name);
  const description = normalizeText(input?.description);
  const instructions = typeof input?.instructions === 'string' ? input.instructions.trim() : '';

  if (!name || name.length > MAX_SKILL_NAME_LENGTH) {
    return { ok: false, error: `name required, max ${MAX_SKILL_NAME_LENGTH} chars` };
  }

  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    return { ok: false, error: `description max ${MAX_SKILL_DESCRIPTION_LENGTH} chars` };
  }

  if (!instructions || instructions.length > MAX_SKILL_INSTRUCTIONS_LENGTH) {
    return { ok: false, error: `instructions required, max ${MAX_SKILL_INSTRUCTIONS_LENGTH} chars` };
  }

  const skillId = slugifySkillName(name);
  if (!isValidSkillId(skillId)) {
    return { ok: false, error: 'name must produce a valid skill id' };
  }

  return {
    ok: true,
    value: {
      skillId,
      name,
      description,
      instructions,
    },
  };
}

function validateSkillId(input) {
  const skillId = normalizeText(input);
  if (!isValidSkillId(skillId)) {
    return { ok: false, error: 'invalid skill_id' };
  }
  return { ok: true, value: skillId };
}

function validateNewSkillName(input) {
  const name = normalizeText(input);
  if (!name || name.length > MAX_SKILL_NAME_LENGTH) {
    return { ok: false, error: `new_name required, max ${MAX_SKILL_NAME_LENGTH} chars` };
  }

  const skillId = slugifySkillName(name);
  if (!isValidSkillId(skillId)) {
    return { ok: false, error: 'new_name must produce a valid skill id' };
  }

  return { ok: true, value: { name, skillId } };
}

function inferSkillNameFromFilename(filename) {
  const rawName = normalizeText(
    String(filename || '')
      .split(/[\\/]/)
      .pop()
      .replace(/\.skill$/i, '')
  );

  return rawName;
}

module.exports = {
  buildSkillArchive,
  buildSkillDetail,
  buildSkillFiles,
  extractSkillArchive,
  inferSkillNameFromFilename,
  isValidPartition,
  isValidSkillId,
  mapSkillRowToClaudeSkill,
  slugifySkillName,
  validateNewSkillName,
  validateSimpleSkillInput,
  validateSkillId,
};
