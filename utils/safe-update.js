function pickAllowedFields(source, allowedFields) {
    const allowed = new Set(allowedFields);
    const data = {};
    for (const [key, value] of Object.entries(source || {})) {
        if (allowed.has(key)) data[key] = value;
    }
    return data;
}

function buildSafeUpdate(source, allowedFields) {
    const data = pickAllowedFields(source, allowedFields);
    const keys = Object.keys(data);
    return {
        data,
        keys,
        clause: keys.map(key => `${key} = ?`).join(', '),
        values: keys.map(key => data[key])
    };
}

module.exports = { pickAllowedFields, buildSafeUpdate };
