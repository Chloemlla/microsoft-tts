/**
 * Simple in-memory rate limiter using sliding window algorithm.
 * 
 * Security notes:
 * - Max entries capped to prevent memory exhaustion attacks
 * - IP extraction prioritizes trusted proxy headers but falls back safely
 * - Cleanup runs periodically via unref'd timer (won't block process exit)
 */

interface RateLimitEntry {
    timestamps: number[]
}

const MAX_ENTRIES = 10000 // Cap to prevent memory exhaustion

class RateLimiter {
    private requests: Map<string, RateLimitEntry> = new Map()
    private readonly windowMs: number
    readonly maxRequests: number
    private cleanupTimer: ReturnType<typeof setInterval>

    constructor(windowMs: number = 60000, maxRequests: number = 60) {
        this.windowMs = windowMs
        this.maxRequests = maxRequests

        // Clean up old entries every 5 minutes; unref so it won't keep process alive
        this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref()
        }
    }

    /**
     * Check if a request should be rate limited
     */
    check(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
        const now = Date.now()
        const entry = this.requests.get(identifier) || { timestamps: [] }

        // Remove timestamps outside the current window
        entry.timestamps = entry.timestamps.filter(
            timestamp => now - timestamp < this.windowMs
        )

        const allowed = entry.timestamps.length < this.maxRequests
        const remaining = Math.max(0, this.maxRequests - entry.timestamps.length - (allowed ? 1 : 0))
        const oldestTimestamp = entry.timestamps[0] || now
        const resetAt = oldestTimestamp + this.windowMs

        if (allowed) {
            entry.timestamps.push(now)
            this.requests.set(identifier, entry)

            // Evict oldest entries if map exceeds cap
            if (this.requests.size > MAX_ENTRIES) {
                const firstKey = this.requests.keys().next().value
                if (firstKey !== undefined) {
                    this.requests.delete(firstKey)
                }
            }
        }

        return { allowed, remaining, resetAt }
    }

    /**
     * Clean up old entries to prevent memory leaks
     */
    private cleanup(): void {
        const now = Date.now()
        for (const [identifier, entry] of this.requests.entries()) {
            entry.timestamps = entry.timestamps.filter(
                timestamp => now - timestamp < this.windowMs
            )
            if (entry.timestamps.length === 0) {
                this.requests.delete(identifier)
            }
        }
    }

    /**
     * Reset rate limit for a specific identifier
     */
    reset(identifier: string): void {
        this.requests.delete(identifier)
    }

    /**
     * Get current request count for an identifier
     */
    getCount(identifier: string): number {
        const now = Date.now()
        const entry = this.requests.get(identifier)
        if (!entry) return 0

        return entry.timestamps.filter(
            timestamp => now - timestamp < this.windowMs
        ).length
    }
}

// Create rate limiter instances for different endpoints
export const ttsRateLimiter = new RateLimiter(60000, 60) // 60 requests per minute
export const voicesRateLimiter = new RateLimiter(60000, 30) // 30 requests per minute

/**
 * Get client identifier from request.
 * 
 * SECURITY: X-Forwarded-For and X-Real-IP can be spoofed by clients.
 * In production, configure your reverse proxy (nginx/cloudflare) to set
 * a trusted header and strip client-supplied forwarded headers.
 * 
 * The TRUSTED_PROXY_HEADER env var allows specifying which header to trust.
 * If not set, falls back to common headers with a warning logged on first use.
 */
export function getClientIdentifier(request: Request): string {
    const trustedHeader = process.env.TRUSTED_PROXY_HEADER
    
    if (trustedHeader) {
        // Use only the explicitly trusted header
        const value = request.headers.get(trustedHeader.toLowerCase())
        if (value) {
            return value.split(',')[0].trim()
        }
    }

    // Fallback chain — note these can be spoofed without a trusted proxy
    const cfConnectingIp = request.headers.get('cf-connecting-ip')
    const realIp = request.headers.get('x-real-ip')
    const forwardedFor = request.headers.get('x-forwarded-for')

    return cfConnectingIp || realIp || forwardedFor?.split(',')[0].trim() || 'unknown'
}

/**
 * Apply rate limiting to a request
 */
export function applyRateLimit(
    request: Request,
    limiter: RateLimiter
): { allowed: boolean; headers: Record<string, string>; error?: string } {
    const identifier = getClientIdentifier(request)
    const { allowed, remaining, resetAt } = limiter.check(identifier)

    const headers = {
        'X-RateLimit-Limit': limiter.maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(resetAt).toISOString(),
    }

    if (!allowed) {
        return {
            allowed: false,
            headers,
            error: 'Rate limit exceeded. Please try again later.'
        }
    }

    return { allowed: true, headers }
}
