import { createApiClient } from '@sabz/api-client'

export { ApiError } from '@sabz/api-client'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1'

const client = createApiClient({ baseUrl: API_BASE_URL })

export const request = client.request
