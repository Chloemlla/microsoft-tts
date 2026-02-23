import { XMLBuilder } from "fast-xml-parser";

/**
 * Escape special XML characters to prevent SSML injection.
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/**
 * SSML Builder for Microsoft Edge TTS
 * Supports full SSML features including express-as, emphasis, break, etc.
 */
export class SSML {
    private builder: XMLBuilder
    private text: string
    private voiceName: string
    private volume: number
    private rate: number
    private pitch: number
    private style?: string
    private styleDegree?: number
    private role?: string

    constructor(
        text: string, 
        voiceName: string = 'zh-CN-XiaoxiaoNeural', 
        volume: number = 100, 
        rate: number = 0, 
        pitch: number = 0,
        style?: string,
        styleDegree?: number,
        role?: string
    ) {
        this.builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@",
            textNodeName: "text",
        });
        this.text = text
        this.voiceName = voiceName
        this.volume = volume
        this.rate = rate
        this.pitch = pitch
        this.style = style
        this.styleDegree = styleDegree
        this.role = role
    }

    toString(): string {
        const safeText = escapeXml(this.text)
        let voiceContent: any = {
            "prosody": {
                "text": safeText,
                "@volume": `${this.volume}%`,
                "@rate": `${this.rate}%`,
                "@pitch": `${this.pitch}%`
            },
            "@name": this.voiceName
        }

        // Add mstts:express-as if style is specified
        if (this.style) {
            const expressAs: any = {
                "prosody": voiceContent.prosody,
                "@style": this.style
            }

            if (this.styleDegree !== undefined) {
                expressAs["@styledegree"] = this.styleDegree.toString()
            }

            if (this.role) {
                expressAs["@role"] = this.role
            }

            voiceContent = {
                "mstts:express-as": expressAs,
                "@name": this.voiceName
            }
        }

        const obj = {
            "speak": {
                "voice": voiceContent,
                "@xmlns": "http://www.w3.org/2001/10/synthesis",
                "@xmlns:mstts": "http://www.w3.org/2001/mstts",
                "@xmlns:emo": "http://www.w3.org/2009/10/emotionml",
                "@version": "1.0",
                "@xml:lang": "en-US"
            }
        }

        return this.builder.build(obj)
    }

    /**
     * Validate if the input is already a valid SSML string
     */
    static isSSML(text: string): boolean {
        return text.trim().startsWith('<speak') && text.trim().endsWith('</speak>')
    }

    /**
     * Create SSML from raw XML string
     */
    static fromString(ssml: string): string {
        if (!SSML.isSSML(ssml)) {
            throw new Error('Invalid SSML format. Must start with <speak> and end with </speak>')
        }
        return ssml
    }
}

/**
 * Advanced SSML Builder with fluent API
 */
export class SSMLBuilder {
    private elements: any[] = []
    private voiceName: string
    private lang: string

    constructor(voiceName: string = 'zh-CN-XiaoxiaoNeural', lang: string = 'en-US') {
        this.voiceName = voiceName
        this.lang = lang
    }

    /**
     * Add plain text
     */
    text(content: string): this {
        this.elements.push(escapeXml(content))
        return this
    }

    /**
     * Add text with prosody (rate, pitch, volume)
     */
    prosody(
        content: string, 
        options: { 
            rate?: string | number, 
            pitch?: string | number, 
            volume?: string | number 
        }
    ): this {
        const prosody: any = { text: content }
        
        if (options.rate !== undefined) {
            prosody['@rate'] = typeof options.rate === 'number' ? `${options.rate}%` : options.rate
        }
        if (options.pitch !== undefined) {
            prosody['@pitch'] = typeof options.pitch === 'number' ? `${options.pitch}%` : options.pitch
        }
        if (options.volume !== undefined) {
            prosody['@volume'] = typeof options.volume === 'number' ? `${options.volume}%` : options.volume
        }

        this.elements.push({ prosody })
        return this
    }

    /**
     * Add express-as for emotional speech
     */
    expressAs(
        content: string, 
        style: string, 
        options?: { 
            styleDegree?: number, 
            role?: string 
        }
    ): this {
        const expressAs: any = {
            text: content,
            '@style': style
        }

        if (options?.styleDegree !== undefined) {
            expressAs['@styledegree'] = options.styleDegree.toString()
        }
        if (options?.role) {
            expressAs['@role'] = options.role
        }

        this.elements.push({ 'mstts:express-as': expressAs })
        return this
    }

    /**
     * Add a break (pause)
     */
    break(time: string): this {
        this.elements.push({ 
            break: { '@time': time } 
        })
        return this
    }

    /**
     * Add emphasis
     */
    emphasis(content: string, level: 'strong' | 'moderate' | 'reduced' = 'moderate'): this {
        this.elements.push({
            emphasis: {
                text: content,
                '@level': level
            }
        })
        return this
    }

    /**
     * Add phoneme for pronunciation
     */
    phoneme(content: string, ph: string, alphabet: 'ipa' | 'sapi' = 'ipa'): this {
        this.elements.push({
            phoneme: {
                text: content,
                '@alphabet': alphabet,
                '@ph': ph
            }
        })
        return this
    }

    /**
     * Add say-as for number/date interpretation
     */
    sayAs(
        content: string, 
        interpretAs: 'number' | 'ordinal' | 'digits' | 'date' | 'time' | 'telephone',
        format?: string
    ): this {
        const sayAs: any = {
            text: content,
            '@interpret-as': interpretAs
        }

        if (format) {
            sayAs['@format'] = format
        }

        this.elements.push({ 'say-as': sayAs })
        return this
    }

    /**
     * Build the final SSML string
     */
    build(): string {
        const builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@",
            textNodeName: "text",
        })

        const obj = {
            speak: {
                voice: {
                    ...this.combineElements(),
                    '@name': this.voiceName
                },
                '@xmlns': 'http://www.w3.org/2001/10/synthesis',
                '@xmlns:mstts': 'http://www.w3.org/2001/mstts',
                '@xmlns:emo': 'http://www.w3.org/2009/10/emotionml',
                '@version': '1.0',
                '@xml:lang': this.lang
            }
        }

        return builder.build(obj)
    }

    private combineElements(): any {
        if (this.elements.length === 0) {
            return { text: '' }
        }
        if (this.elements.length === 1) {
            return this.elements[0]
        }
        
        // Multiple elements - need to wrap them
        return this.elements
    }
}