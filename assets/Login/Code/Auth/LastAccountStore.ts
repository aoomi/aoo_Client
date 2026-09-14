import type { KeyValueStorage } from '../../../Common/Code/Runtime/core/Storage';

const LAST_ACCOUNT_KEY = 'aoo.auth.last-account';

export class LastAccountStore {
    public constructor(private readonly storage: KeyValueStorage) {}

    public load(): string {
        return this.storage.get(LAST_ACCOUNT_KEY)?.trim() ?? '';
    }

    public save(account: string): void {
        this.storage.set(LAST_ACCOUNT_KEY, account.trim());
    }

    public clear(): void {
        this.storage.remove(LAST_ACCOUNT_KEY);
    }
}
