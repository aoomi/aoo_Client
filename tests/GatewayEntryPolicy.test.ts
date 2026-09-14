import assert from 'node:assert/strict';
import test from 'node:test';
import {
    API_VERSION_HEADER,
    canonicalApiPath,
    httpGatewayUrl,
    requireCanonicalWebSocketUrl,
    webSocketGatewayUrl,
} from '../assets/Common/Code/Runtime/network/GatewayEntryPolicy.ts';

test('accepts only the canonical API prefix and never rewrites retired aliases', () => {
    assert.throws(() => canonicalApiPath('/v1/history?limit=20'));
    assert.equal(canonicalApiPath('/api/v2/history'), '/api/v2/history');
    assert.throws(() => canonicalApiPath('/api/v1/history'));
    assert.equal(API_VERSION_HEADER, 'X-Aoo-Api-Version');
});

test('derives HTTP and WSS from one credential-free gateway origin', () => {
    assert.equal(httpGatewayUrl('/api/v2/history', 'https://edge.example'), 'https://edge.example/api/v2/history');
    assert.equal(webSocketGatewayUrl('once', 'https://edge.example'), 'wss://edge.example/api/v2/gateway/ws?ticket=once');
    assert.throws(() => httpGatewayUrl('/api/v2/history', 'https://user:secret@edge.example'));
});

test('blocks old and parameter-smuggling websocket entries', () => {
    assert.equal(requireCanonicalWebSocketUrl('wss://edge.example/api/v2/gateway/ws'), 'wss://edge.example/api/v2/gateway/ws');
    assert.throws(() => requireCanonicalWebSocketUrl('wss://edge.example/ws'));
    assert.throws(() => requireCanonicalWebSocketUrl('wss://edge.example/api/v2/gateway/ws?token=long-lived'));
    assert.throws(() => requireCanonicalWebSocketUrl('wss://edge.example/api/v2/gateway/ws?ticket=one&ticket=two'));
});

test('allows plain WS only for the same-host Creator LAN preview in test', () => {
    const runtime = globalThis as typeof globalThis & {
        location?: Pick<Location, 'protocol' | 'hostname'>;
        __aoo_RUNTIME_CONFIG__?: { environment?: 'test' | 'production' };
    };
    const previousLocation = runtime.location;
    const previousConfig = runtime.__aoo_RUNTIME_CONFIG__;
    Object.defineProperty(runtime, 'location', {
        configurable: true,
        value: { protocol: 'http:', hostname: '192.168.1.107' },
    });
    try {
        runtime.__aoo_RUNTIME_CONFIG__ = { environment: 'test' };
        assert.equal(
            requireCanonicalWebSocketUrl('ws://192.168.1.107:8080/api/v2/gateway/ws'),
            'ws://192.168.1.107:8080/api/v2/gateway/ws',
        );
        assert.throws(() => requireCanonicalWebSocketUrl('ws://192.168.1.108:8080/api/v2/gateway/ws'));
        runtime.__aoo_RUNTIME_CONFIG__ = { environment: 'production' };
        assert.throws(() => requireCanonicalWebSocketUrl('ws://192.168.1.107:8080/api/v2/gateway/ws'));
    } finally {
        runtime.__aoo_RUNTIME_CONFIG__ = previousConfig;
        Object.defineProperty(runtime, 'location', { configurable: true, value: previousLocation });
    }
});
