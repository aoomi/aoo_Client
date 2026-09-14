export type HostRoute =
    | { name: 'login' }
    | { name: 'lobby' }
    | { name: 'club'; clubId: number }
    | { name: 'game'; pluginId: string; roomId: number; returnTo: Exclude<HostRoute, { name: 'game' }> };
