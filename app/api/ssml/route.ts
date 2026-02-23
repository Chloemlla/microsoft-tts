import { EdgeTTSService } from "@/service/edge-tts-service"
import { SSML } from "@/service/ssml"
import { applyRateLimit, ttsRateLimiter } from "../utils/rate-limiter"
import { logger } from "../utils/logger"
import { verifyBearerToken, jsonError } from "../utils/auth"

// Force this route to be dynamic
export const dynamic = 'force-dynamic'

// ============ API Handler ============

/**
 * POST endpoint for SSML to Speech conversion
 * Accepts raw SSML in request body
 */
export async function POST(request: Request) {
    const requestId = logger.logRequest(request, { endpoint: '/api/ssml' })
    const startTime = Date.now()

    try {
        // Rate limiting
        const rateLimitResult = applyRateLimit(request, ttsRateLimiter)
        if (!rateLimitResult.allowed) {
            logger.warn('Rate limit exceeded', {
                requestId,
                endpoint: '/api/ssml',
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
                endpoint: '/api/ssml',
                error: authResult.error,
            })
            return jsonError(authResult.error || 'Unauthorized', 401, rateLimitResult.headers)
        }

        // Parse request body
        const contentType = request.headers.get('content-type')
        let ssml: string

        if (contentType?.includes('application/json')) {
            const body = await request.json()
            ssml = body.ssml

            if (!ssml) {
                return jsonError('Missing ssml field in JSON body', 400, rateLimitResult.headers)
            }
        } else if (contentType?.includes('text/xml') || contentType?.includes('application/xml')) {
            ssml = await request.text()
        } else {
            ssml = await request.text()
        }

        logger.debug('SSML request', {
            requestId,
            ssmlLength: ssml.length,
            contentType,
        })

        // Validate SSML format
        if (!SSML.isSSML(ssml)) {
            logger.warn('Invalid SSML format', {
                requestId,
                ssmlPreview: ssml.substring(0, 100),
            })
            return jsonError(
                'Invalid SSML format. Must start with <speak> and end with </speak>',
                400,
                rateLimitResult.headers
            )
        }

        // Validate length
        if (ssml.length > 50000) {
            logger.warn('SSML too long', {
                requestId,
                ssmlLength: ssml.length,
                maxLength: 50000,
            })
            return jsonError('SSML too long (max 50000 characters)', 400, rateLimitResult.headers)
        }

        // Convert SSML to speech
        logger.info('Starting SSML conversion', { requestId })
        const service = new EdgeTTSService()
        const speech = await service.convertFromSSML(ssml)
        const audioBlob = new Blob([speech.audio], { type: 'audio/mpeg' })

        const duration = Date.now() - startTime
        logger.info('SSML conversion successful', {
            requestId,
            audioSize: speech.audio.byteLength,
            duration: `${duration}ms`,
        })

        return new Response(audioBlob, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
                ...rateLimitResult.headers
            }
        })
    } catch (error) {
        const duration = Date.now() - startTime
        logger.error('SSML conversion error', error, {
            requestId,
            endpoint: '/api/ssml',
            duration: `${duration}ms`,
        })

        return jsonError('Internal server error', 500)
    }
}
