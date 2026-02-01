/**
 * Database Utility Helper
 * Simplifies construction of dynamic SQL queries.
 */

/**
 * Builds a WHERE clause dynamically from a filters object.
 * @param {Object} filters - Key-value pairs where key is column name, value is filter value.
 * @param {number} startParamIndex - The starting index for parameters ($1, $2, etc.). Default is 1.
 * @returns {Object} { where: string, params: Array, nextIndex: number }
 */
const buildWhereClause = (filters, startParamIndex = 1) => {
    const clauses = [];
    const params = [];
    let index = startParamIndex;

    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
            clauses.push(`${key} = $${index++}`);
            params.push(value);
        }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : 'WHERE 1=1';

    return {
        where,
        params,
        nextIndex: index
    };
};

module.exports = {
    buildWhereClause
};
