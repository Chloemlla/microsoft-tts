import { verifyQueryToken, jsonError } from "../utils/auth"

// Force this route to be dynamic
export const dynamic = 'force-dynamic'

// ============ Utility Functions ============

function jsonSuccess<T>(data: T): Response {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })
}

function parseNumberParam(
    searchParams: URLSearchParams,
    paramName: string,
    defaultValue: number,
    min: number,
    max: number
): number {
    const paramValue = searchParams.get(paramName)

    if (paramValue === null || paramValue === undefined) {
        return defaultValue
    }

    const num = Number(paramValue)

    if (Number.isNaN(num)) {
        throw new Error(`Invalid ${paramName}: must be a number`)
    }

    if (num < min || num > max) {
        throw new Error(`Invalid ${paramName}: must be between ${min} and ${max}`)
    }

    return num
}

function parseRequiredParam(searchParams: URLSearchParams, paramName: string): string {
    const value = searchParams.get(paramName)

    if (!value || value.trim() === '') {
        throw new Error(`Missing required parameter: ${paramName}`)
    }

    return value
}

// ============ API Handler ============

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)

        // Authentication
        const authResult = verifyQueryToken(searchParams)
        if (!authResult.authorized) {
            return jsonError(authResult.error || 'Unauthorized', 401)
        }

        // Parse and validate parameters
        const voice = parseRequiredParam(searchParams, 'voice')
        const pitch = parseNumberParam(searchParams, 'pitch', 0, -100, 100)
        const volume = parseNumberParam(searchParams, 'volume', 100, 0, 100)
        const personality = searchParams.get('personality') || undefined
        const protocol = searchParams.get('protocol') || 'http'

        // Build API URL for Legado
        const options = {
            voice,
            volume,
            pitch,
            ...(personality && { personality }),
        }

        let queryString = Object.entries(options)
            .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
            .join('&')

        queryString = `${queryString}&rate={{(speakSpeed - 10) * 2}}`

        const host = request.headers.get('host')
        const baseUrl = `${protocol}://${host}/api/text-to-speech`
        const apiUrl = `${baseUrl}?${queryString}&text={{java.encodeURI(speakText)}}`

        const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN
        const header = requiredToken ? { Authorization: `Bearer ${requiredToken}` } : {}

        // Build Legado import data
        const data = {
            name: voice,
            contentType: 'audio/mpeg',
            id: Date.now(),
            loginCheckJs: '',
            loginUi: '',
            loginUrl: '',
            url: apiUrl,
            header: JSON.stringify(header)
        }

        return jsonSuccess(data)
    } catch (error) {
        console.error('Legado import error:', error)
        return jsonError('Internal server error', 500)
    }
}
