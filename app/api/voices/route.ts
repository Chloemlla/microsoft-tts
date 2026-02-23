import { EdgeTTSService } from "@/service/edge-tts-service"
import { applyRateLimit, voicesRateLimiter } from "../utils/rate-limiter"
import { logger } from "../utils/logger"
import { verifyBearerToken, jsonError } from "../utils/auth"

// Force this route to be dynamic
export const dynamic = 'force-dynamic'

// ============ Utility Functions ============

function jsonResponse(data: unknown, status: number = 200, additionalHeaders?: Record<string, string>): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...additionalHeaders
        }
    })
}

// ============ API Handler ============

export async function GET(request: Request) {
    const requestId = logger.logRequest(request, { endpoint: '/api/voices' })
    const startTime = Date.now()

    try {
        // Rate limiting
        const rateLimitResult = applyRateLimit(request, voicesRateLimiter)
        if (!rateLimitResult.allowed) {
            logger.warn('Rate limit exceeded', {
                requestId,
                endpoint: '/api/voices',
            })
            return jsonError(
                rateLimitResult.error || 'Rate limit exceeded',
                429,
                rateLimitResult.headers
            )
        }

        // Authentication
        const authResult = verifyBearerToken(request)
        if (!authResult.authorized) {
            logger.warn('Unauthorized access attempt', {
                requestId,
                endpoint: '/api/voices',
                error: authResult.error,
            })
            return jsonError(authResult.error || 'Unauthorized', 401, rateLimitResult.headers)
        }

        logger.debug('Fetching voices from Edge TTS service', { requestId })

        // Fetch voices from Edge TTS service
        const service = new EdgeTTSService()
        const voices = await service.fetchVoices()

        logger.info('Successfully fetched voices', {
            requestId,
            voiceCount: voices.length,
            duration: `${Date.now() - startTime}ms`,
        })

        // Return voices with rate limit headers
        return jsonResponse(
            {
                success: true,
                count: voices.length,
                voices: voices,
            },
            200,
            {
                ...rateLimitResult.headers,
                'Cache-Control': 'public, max-age=3600',
            }
        )
    } catch (error) {
        const duration = Date.now() - startTime
        logger.error('Failed to fetch voices', error, {
            requestId,
            endpoint: '/api/voices',
            duration: `${duration}ms`,
        })

        return jsonError('Internal server error', 500)
    }
}
