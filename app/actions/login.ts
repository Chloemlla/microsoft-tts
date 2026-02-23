'use server'

import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        const buf = Buffer.from(a)
        timingSafeEqual(buf, buf)
        return false
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * 验证用户登录token
 * 如果设置了MS_RA_FORWARDER_TOKEN环境变量，则需要验证token
 * 如果未设置环境变量，则允许任何非空token登录
 * 
 * NOTE: 不再返回 token 明文到客户端，避免服务端密钥泄露
 */
export async function login(token: string) {
    const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN

    if (requiredToken) {
        if (safeCompare(token, requiredToken)) {
            return { success: true }
        } else {
            throw new Error('Token is invalid')
        }
    } else {
        if (token && token.trim() !== '') {
            return { success: true }
        } else {
            throw new Error('Token is required')
        }
    }
}

/**
 * 检查是否需要认证（是否设置了MS_RA_FORWARDER_TOKEN环境变量）
 */
export async function isAuthRequired() {
    return !!(process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN)
}
