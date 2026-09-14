// 等价替代 2.4.8 的 MD5Tool.hex_md5。该摘要只用于旧 C1008Login
// 协议兼容，不用于保存密码或新安全设计。
export function legacyMd5(input: string): string {
    const source = new TextEncoder().encode(input);
    const paddedLength = (((source.length + 8) >>> 6) + 1) << 6;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(source);
    bytes[source.length] = 0x80;
    const bitLength = source.length * 8;
    const view = new DataView(bytes.buffer);
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const constants = Array.from({ length: 64 }, (_, index) =>
        Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);

    for (let offset = 0; offset < bytes.length; offset += 64) {
        const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let index = 0; index < 64; index += 1) {
            let value: number;
            let wordIndex: number;
            if (index < 16) {
                value = (b & c) | (~b & d);
                wordIndex = index;
            } else if (index < 32) {
                value = (d & b) | (~d & c);
                wordIndex = (5 * index + 1) % 16;
            } else if (index < 48) {
                value = b ^ c ^ d;
                wordIndex = (3 * index + 5) % 16;
            } else {
                value = c ^ (b | ~d);
                wordIndex = (7 * index) % 16;
            }
            const sum = (a + value + constants[index]! + words[wordIndex]!) >>> 0;
            const shift = shifts[Math.floor(index / 16) * 4 + (index % 4)]!;
            const rotated = ((sum << shift) | (sum >>> (32 - shift))) >>> 0;
            a = d;
            d = c;
            c = b;
            b = (b + rotated) >>> 0;
        }
        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0]
        .map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join(''))
        .join('');
}
