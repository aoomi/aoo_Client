export interface LegacyRequestHead {
    messageType: 2 | 3;
    event: string;
    sequence: number;
}

export interface LegacyIncomingPacket {
    event: string;
    sequence: number;
    errorCode: number;
    body: unknown;
}

export interface LegacyIncomingFrame {
    event: string;
    sequence: number;
    errorCode: number;
    totalParts: number;
    partIndex: number;
    bodyText: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_UTF_BYTES = 0x7fff;
const MIN_RESPONSE_BYTES = 27;

export class LegacyPacketCodec {
    public encode(head: LegacyRequestHead, body: unknown): ArrayBuffer {
        const event = encoder.encode(head.event.toLowerCase());
        const json = encoder.encode(JSON.stringify(body));
        if (!event.length || event.length > 256 || json.length > MAX_UTF_BYTES) {
            throw new Error('封包字段长度超出协议限制');
        }
        const buffer = new ArrayBuffer(1 + 2 + 2 + event.length + 2 + json.length);
        const view = new DataView(buffer);
        let offset = 0;
        view.setUint8(offset, head.messageType); offset += 1;
        view.setInt16(offset, head.sequence); offset += 2;
        offset = this.writeUtf(view, offset, event);
        this.writeUtf(view, offset, json);
        return buffer;
    }

    public decode(buffer: ArrayBuffer): LegacyIncomingPacket {
        const frame = this.decodeFrame(buffer);
        if (frame.totalParts !== 1 || frame.partIndex !== 0) {
            throw new Error(`封包尚未组装：${frame.partIndex + 1}/${frame.totalParts}`);
        }
        return this.toPacket(frame, frame.bodyText);
    }

    public decodeFrame(buffer: ArrayBuffer): LegacyIncomingFrame {
        if (buffer.byteLength < MIN_RESPONSE_BYTES || buffer.byteLength > (1 << 20)) {
            throw new Error(`非法封包长度：${buffer.byteLength}`);
        }
        const view = new DataView(buffer);
        let offset = 0;
        offset += 1; // messageType
        offset += 1; // srcType
        offset += 8; // srcId
        offset += 1; // destType
        offset += 8; // destId
        const encodedTotalParts = view.getInt16(offset); offset += 2;
        const encodedPartIndex = view.getInt16(offset); offset += 2;
        // Both 2.4.8 network implementations only enter the assembly branch
        // when allPack > 1. Game servers still emit the historical 0/1
        // single-frame marker, so normalize every allPack <= 1 frame here.
        const totalParts = encodedTotalParts <= 1 ? 1 : encodedTotalParts;
        const partIndex = encodedTotalParts <= 1 ? 0 : encodedPartIndex;
        if (totalParts > 256 || partIndex < 0 || partIndex >= totalParts) {
            throw new Error(`非法拆分封包序号：${encodedPartIndex + 1}/${encodedTotalParts}`);
        }
        const eventResult = this.readUtf(view, offset); offset = eventResult.offset;
        const sequence = view.getInt16(offset); offset += 2;
        const errorCode = view.getInt16(offset); offset += 2;
        const bodyResult = this.readUtf(view, offset);
        return {
            event: eventResult.value.toLowerCase(),
            sequence,
            errorCode,
            totalParts,
            partIndex,
            bodyText: bodyResult.value,
        };
    }

    public toPacket(frame: LegacyIncomingFrame, bodyText: string): LegacyIncomingPacket {
        return {
            event: frame.event,
            sequence: frame.sequence,
            errorCode: frame.errorCode,
            body: frame.errorCode ? { Msg: bodyText } : JSON.parse(bodyText || '{}'),
        };
    }

    private writeUtf(view: DataView, offset: number, bytes: Uint8Array): number {
        if (bytes.length > MAX_UTF_BYTES || offset + 2 + bytes.length > view.byteLength) {
            throw new Error('非法 UTF 字段长度');
        }
        view.setInt16(offset, bytes.length); offset += 2;
        new Uint8Array(view.buffer, offset, bytes.length).set(bytes);
        return offset + bytes.length;
    }

    private readUtf(view: DataView, offset: number): { value: string; offset: number } {
        if (offset < 0 || offset + 2 > view.byteLength) throw new Error('封包 UTF 长度缺失');
        const length = view.getInt16(offset); offset += 2;
        if (length < 0 || length > MAX_UTF_BYTES || offset + length > view.byteLength) {
            throw new Error('封包 UTF 长度非法');
        }
        const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
        return { value: decoder.decode(bytes), offset: offset + length };
    }
}
