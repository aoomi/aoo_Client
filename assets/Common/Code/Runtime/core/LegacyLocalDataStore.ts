import { sys } from 'cc';

export type LegacyConfigValue = string | number | boolean | unknown[] | Record<string, unknown>;

const DEFAULTS: Record<string, Record<string, LegacyConfigValue>> = {
    SysSetting: {
        MainBackMusic: 'MainScene', GameBackMusic: 'sssBackGround', BackMusic: 1, SpSound: 1,
        BackVolume: 1, SpVolume: 1, IsShowChat: 1, IsPlayVideo: 1, TuiGuangUrl: '',
        Language: 1, IsAudio: 1, QianDao: 0, is3DShow: 0, Date: -1, LastGameType: '',
        ClubBg: 4, ClubTb: 4, ClubCustom: 0, HeadSpriteFrame: [],
    },
    Account: {
        AccountDict: {}, AccountMobile: {}, AccountList: [], AccountActive: 0, AccessPoint: 0,
        AccessTokenInfo: {}, AccountID: 0, XlOpenID: '', uuid: 0,
    },
    DebugInfo: { GateServerInfo: {}, AccountServerInfo: {}, OrderServerInfo: {}, GameServerInfo: {}, ResServerInfo: {} },
};

export class LegacyLocalDataStore {
    private readonly server = 'Server01';

    public initialize(): void {
        for (const [group, values] of Object.entries(DEFAULTS)) {
            const current = this.read(group);
            let changed = false;
            for (const [key, value] of Object.entries(values)) {
                if (Object.prototype.hasOwnProperty.call(current, key)) continue;
                current[key] = this.clone(value);
                changed = true;
            }
            if (changed) this.write(group, current);
        }
    }

    public has(group: string | number, option: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.read(String(group)), option);
    }

    public get<T extends LegacyConfigValue>(group: string | number, option: string, fallback?: T): T | undefined {
        const value = this.read(String(group))[option];
        return (value === undefined ? fallback : value) as T | undefined;
    }

    public set(group: string | number, option: string, value: LegacyConfigValue): void {
        const data = this.read(String(group));
        data[option] = value;
        this.write(String(group), data);
    }

    public initializePlayer(heroId: string | number): void {
        const data = this.read(String(heroId));
        const player = (data[this.server] as Record<string, unknown> | undefined) ?? {};
        if (!Array.isArray(player.EventIDList)) player.EventIDList = [];
        if (!player.OrderDict || typeof player.OrderDict !== 'object') player.OrderDict = {};
        data[this.server] = player;
        this.write(String(heroId), data);
    }

    public getPlayer<T extends LegacyConfigValue>(heroId: string | number, option: string, fallback?: T): T | undefined {
        const player = this.read(String(heroId))[this.server] as Record<string, T> | undefined;
        return player?.[option] ?? fallback;
    }

    public setPlayer(heroId: string | number, option: string, value: LegacyConfigValue): void {
        const data = this.read(String(heroId));
        const player = (data[this.server] as Record<string, LegacyConfigValue> | undefined) ?? {};
        player[option] = value;
        data[this.server] = player;
        this.write(String(heroId), data);
    }

    public remove(group: string | number): void { sys.localStorage.removeItem(String(group)); }

    private read(group: string): Record<string, LegacyConfigValue> {
        try {
            const raw = sys.localStorage.getItem(group);
            return raw ? JSON.parse(raw) as Record<string, LegacyConfigValue> : {};
        } catch {
            sys.localStorage.removeItem(group);
            return {};
        }
    }

    private write(group: string, value: Record<string, LegacyConfigValue>): void {
        sys.localStorage.setItem(group, JSON.stringify(value));
    }

    private clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
}

export const legacyLocalDataStore = new LegacyLocalDataStore();
