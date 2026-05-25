import createClient from 'openapi-fetch';

/** @typedef {import('./schema').paths} Paths */

/** @type {ReturnType<typeof createClient<Paths>>} */
const api = createClient({ baseUrl: '' });

export default api;
