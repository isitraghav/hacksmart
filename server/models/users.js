const { query } = require('../config/database');

const usersModel = {
    findByUsername: async (username) => {
        const res = await query('SELECT * FROM users WHERE username = $1', [username]);
        return res.rows[0];
    },

    createUser: async (username, passwordHash, role, entityId) => {
        const sql = `
            INSERT INTO users (username, password_hash, role, entity_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, username, role, entity_id, created_at
        `;
        const res = await query(sql, [username, passwordHash, role, entityId]);
        return res.rows[0];
    }
};

module.exports = usersModel;
