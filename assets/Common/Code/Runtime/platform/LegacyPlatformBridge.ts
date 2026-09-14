import { native, sys } from 'cc';

export type LegacyNativeValue = string | number | boolean;

export interface LegacyNativeArgument {
    Name: string;
    Value: LegacyNativeValue;
}

export interface LegacyNativeNotification {
    eventType: string;
    data: Record<string, unknown>;
}

type NotificationListener = (notification: LegacyNativeNotification) => void;

const JAVA_CLASS = 'org/cocos2dx/javascript/NativeMgr';
const OC_CLASS = 'NativeMgr';
const JAVA_TYPES: Record<string, string> = {
    boolean: 'Z',
    number: 'F',
    string: 'Ljava/lang/String;',
};

export class LegacyPlatformBridge {
    private readonly listeners = new Set<NotificationListener>();

    public get isNative(): boolean {
        return sys.isNative;
    }

    public get platform(): 'android' | 'ios' | 'web' | 'unknown' {
        if (!sys.isNative) return 'web';
        if (sys.os === sys.OS.ANDROID) return 'android';
        if (sys.os === sys.OS.IOS) return 'ios';
        return 'unknown';
    }

    public callNative(method: string, args: readonly LegacyNativeArgument[] = [], returnType?: 'Number' | 'String' | 'Boolean' | 'Float'): unknown {
        if (!method || !sys.isNative) return undefined;
        const nativeArgs = args.map((arg) => ({ Name: arg.Name, Value: arg.Value }));
        nativeArgs.push({ Name: 'subGameName', Value: 'hall' });
        try {
            if (this.platform === 'android') return this.callAndroid(method, nativeArgs, returnType);
            if (this.platform === 'ios') {
                if (method === 'getVersion' || method === 'checkVersion') return undefined;
                return this.callIOS(method, nativeArgs);
            }
        } catch (error) {
            console.error(`[LegacyPlatformBridge] ${method} failed`, error);
        }
        return undefined;
    }

    public openURL(url: string): boolean {
        if (!url) return false;
        sys.openURL(url);
        return true;
    }

    public async writeClipboard(text: string): Promise<boolean> {
        if (sys.isNative) {
            this.callNative('copyText', [{ Name: 'copyText', Value: text }]);
            return true;
        }
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) return false;
        await clipboard.writeText(text);
        return true;
    }

    public requestLocation(): boolean {
        if (!sys.isNative) return false;
        this.callNative('GetLocation');
        return true;
    }

    public callLegacy(method: string, values: Readonly<Record<string, LegacyNativeValue>> = {}, returnType?: 'Number' | 'String' | 'Boolean' | 'Float'): unknown {
        return this.callNative(method, Object.entries(values).map(([Name, Value]) => ({ Name, Value })), returnType);
    }

    public onNotification(listener: NotificationListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public receiveNativeNotification(eventType: string, eventData: string | Record<string, unknown>): boolean {
        try {
            const data = typeof eventData === 'string' ? JSON.parse(eventData) as Record<string, unknown> : eventData;
            if (data.subGameName !== undefined && data.subGameName !== 'hall') return false;
            const notification = { eventType, data };
            for (const listener of this.listeners) listener(notification);
            globalThis.dispatchEvent?.(new CustomEvent('legacy-native-notify', { detail: notification }));
            return true;
        } catch (error) {
            console.error(`[LegacyPlatformBridge] invalid callback ${eventType}`, error);
            return false;
        }
    }

    private callAndroid(method: string, args: readonly LegacyNativeArgument[], returnType?: string): unknown {
        const values: LegacyNativeValue[] = [];
        let signature = '(';
        for (const arg of args) {
            const type = JAVA_TYPES[typeof arg.Value];
            if (!type) throw new TypeError(`Unsupported native argument: ${arg.Name}`);
            signature += type;
            values.push(arg.Value);
        }
        const normalizedReturnType = returnType === 'Number' ? 'number' : returnType?.toLowerCase();
        signature += `)${normalizedReturnType ? JAVA_TYPES[normalizedReturnType] : 'V'}`;
        return native.reflection.callStaticMethod(JAVA_CLASS, method, signature, ...values);
    }

    private callIOS(method: string, args: readonly LegacyNativeArgument[]): unknown {
        let selector = method;
        const values: LegacyNativeValue[] = [];
        args.forEach((arg, index) => {
            selector += index === 0 ? `With${arg.Name}:` : `${arg.Name}:`;
            values.push(arg.Value);
        });
        const callStaticMethod = native.reflection.callStaticMethod as unknown as (
            className: string,
            selectorName: string,
            ...parameters: LegacyNativeValue[]
        ) => unknown;
        return callStaticMethod(OC_CLASS, selector, ...values);
    }
}

export const legacyPlatformBridge = new LegacyPlatformBridge();

type LegacyPlatformGlobals = typeof globalThis & {
    hall_NativeNotify?: { OnNativeNotify: (eventType: string, eventData: string) => boolean };
};

const platformGlobals = globalThis as LegacyPlatformGlobals;
platformGlobals.hall_NativeNotify = {
    OnNativeNotify: (eventType, eventData) => legacyPlatformBridge.receiveNativeNotification(eventType, eventData),
};
