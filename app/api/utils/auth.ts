import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        // Still do a comparison to avoid leaking length info via timing
        const buf = Buffer.from(a)
        timingSafeEqual(buf, buf)
        return false
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Verify Bearer token from Authorization header.
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * WARNING: If neither MS_RA_FORWARDER_TOKEN nor TOKEN env var is set,
 * all requests are authorized. Set one of these in production.
 */
export function verifyBearerToken(request: Request): { authorized: boolean; error?: string } {
    const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN

    if (!requiredToken) {
        if (process.env.NODE_ENV === 'production') {
            console.warn('[SECURITY] No MS_RA_FORWARDER_TOKEN or TOKEN env var set. All requests are authorized. Set a token for production use.')
        }
        return { authorized: true }
    }

    const authorization = request.headers.get('authorization')

    if (!authorization) {
        return { authorized: false, error: 'Missing Authorization header' }
    }

    if (!authorization.startsWith('Bearer ')) {
        return { authorized: false, error: 'Invalid Authorization format. Expected: Bearer <token>' }
    }

    const token = authorization.substring(7)

    if (!safeCompare(token, requiredToken)) {
        return { authorized: false, error: 'Invalid token' }
    }

    return { authorized: true }
}

/**
 * Verify token from query parameter (for Legado import).
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * WARNING: If neither MS_RA_FORWARDER_TOKEN nor TOKEN env var is set,
 * all requests are authorized. Set one of these in production.
 */
export function verifyQueryToken(searchParams: URLSearchParams): { authorized: boolean; error?: string } {
    const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN

    if (!requiredToken) {
        if (process.env.NODE_ENV === 'production') {
            console.warn('[SECURITY] No MS_RA_FORWARDER_TOKEN or TOKEN env var set. All requests are authorized. Set a token for production use.')
        }
        return { authorized: true }
    }

    const token = searchParams.get('token')

    if (!token) {
        return { authorized: false, error: 'Missing token parameter' }
    }

    if (!safeCompare(token, requiredToken)) {
        return { authorized: false, error: 'Invalid token' }
    }

    return { authorized: true }
}

/**
 * Return a generic JSON error response.
 * For 500 errors, always returns a generic message to avoid leaking internals.
 */
export function jsonError(message: string, status: number = 400, additionalHeaders?: Record<string, string>): Response {
    const safeMessage = status >= 500 ? 'Internal server error' : message
    return new Response(JSON.stringify({ error: safeMessage }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...additionalHeaders
        }
    })
}
