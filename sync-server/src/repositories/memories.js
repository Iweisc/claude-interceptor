'use strict';

function formatMemoriesMarkdown(rows) {
  return rows.map((row) => {
    const date = new Date(row.created_at).toISOString().split('T')[0];
    return `[${date}] - ${row.text}`;
  }).join('\n');
}

function createMemoryRepository(pool) {
  return {
    async listMemories(userId) {
      const { rows } = await pool.query(
        `SELECT id, text, created_at
         FROM memories
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      return rows;
    },
    async getFormattedMemories(userId) {
      const rows = await this.listMemories(userId);
      return {
        formatted: formatMemoriesMarkdown(rows),
        count: rows.length,
      };
    },
    async createMemory(userId, text) {
      const { rows } = await pool.query(
        `INSERT INTO memories (user_id, text)
         VALUES ($1, $2)
         RETURNING id, text, created_at`,
        [userId, text]
      );
      return rows[0];
    },
    async replaceMemory(userId, id, text) {
      const { rows } = await pool.query(
        `UPDATE memories
         SET text = $1
         WHERE id = $2 AND user_id = $3
         RETURNING id, text, created_at`,
        [text, id, userId]
      );
      return rows[0] || null;
    },
    async deleteMemory(userId, id) {
      const { rowCount } = await pool.query(
        `DELETE FROM memories
         WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return rowCount > 0;
    },
  };
}

module.exports = {
  createMemoryRepository,
  formatMemoriesMarkdown,
};
