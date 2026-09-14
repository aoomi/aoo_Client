// Generated from Server/protocol/aoo-protocol-v2.json. Do not edit.
export const ProtocolIds = {
    ACCOUNT_LOGIN: 'account.login',
    ACCOUNT_LOGIN_COMPAT: 'account.login_compat',
    ACCOUNT_SESSION_DISPATCH: 'account.session_dispatch',
    ACCOUNT_SESSION_PUSH: 'account.session_push',
    ACCOUNT_TOKEN_REFRESH: 'account.token_refresh',
    ACCOUNT_WS_TICKET: 'account.ws_ticket',
    CLUB_DISPATCH: 'club.dispatch',
    CLUB_MEMBER_PAGE: 'club.member_page',
    CLUB_STATE_PUSH: 'club.state_push',
    COMMON_ROOM_COMPAT_STATE_PUSH: 'common.room.compat_state_push',
    COMMON_ROOM_DISPATCH: 'common.room.dispatch',
    COMMON_ROOM_STATE_PUSH: 'common.room.state_push',
    GAME_ACTION: 'game.action',
    GAME_DISPATCH: 'game.dispatch',
    GAME_FINAL_SETTLEMENT: 'game.final_settlement',
    GAME_ROUND_SETTLEMENT: 'game.round_settlement',
    GAME_STATE_PUSH: 'game.state_push',
    HALL_CATALOG: 'hall.catalog',
    HALL_DISPATCH: 'hall.dispatch',
    HALL_STATE_PUSH: 'hall.state_push',
    LONGCARD_AYCP_DISPATCH: 'longcard.aycp.dispatch',
    LONGCARD_AYDSS_DISPATCH: 'longcard.aydss.dispatch',
    MAHJONG_XUEZHAN_DISPATCH: 'mahjong.xuezhan.dispatch',
    MAHJONG_XUEZHAN_STATE_PUSH: 'mahjong.xuezhan.state_push',
    POKER_CD201_DISPATCH: 'poker.CD201.dispatch',
    POKER_CD201_STATE_PUSH: 'poker.CD201.state_push',
    POKER_LS201_DISPATCH: 'poker.LS201.dispatch',
    POKER_LS201_STATE_PUSH: 'poker.LS201.state_push',
    POKER_NJ201_DISPATCH: 'poker.NJ201.dispatch',
    POKER_NJ201_STATE_PUSH: 'poker.NJ201.state_push',
    POKER_PDK_DISPATCH: 'poker.pdk.dispatch',
    POKER_PDK_STATE_PUSH: 'poker.pdk.state_push',
    REPLAY_PERSPECTIVE_PAGE: 'replay.perspective_page',
    REPLAY_QUERY: 'replay.query',
    ROOM_CREATE: 'room.create',
    ROOM_DISSOLVE_APPLY: 'room.dissolve_apply',
    ROOM_DISSOLVE_VOTE: 'room.dissolve_vote',
    ROOM_JOIN: 'room.join',
    ROOM_LEAVE: 'room.leave',
    ROOM_RECONNECT: 'room.reconnect',
    ROOM_SEAT: 'room.seat',
    SYSTEM_HEARTBEAT: 'system.heartbeat',
    SYSTEM_KICK_OUT: 'system.kick_out',
} as const;
export type ProtocolId = typeof ProtocolIds[keyof typeof ProtocolIds];
export const ProtocolDefinitions = {
    'account.login': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M1","auth":"anonymous","write":true,"idempotency":"required","request":{"type":"object","required":["loginType","credential","deviceId"],"properties":{"loginType":"string","credential":"string","deviceId":"string","clientVersion":"string"}},"response":{"type":"object","required":["accessToken","refreshToken","userId","wsTicket"],"properties":{"accessToken":"string","refreshToken":"string","userId":"string","wsTicket":"string"}},"errors":[1001,1002,2001,2002]},
    'account.login_compat': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M1","auth":"anonymous","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","deviceId"],"properties":{"action":"string","payload":"object","deviceId":"string","clientVersion":"string"}},"response":{"type":"object","required":["payload","wsTicket"],"properties":{"payload":"object","wsTicket":"string"}},"errors":[1001,1002,2001,2002]},
    'account.session_dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M1","auth":"ws_ticket","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload"],"properties":{"payload":"object"}},"errors":[1001,1003,2001,2003]},
    'account.session_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M1","auth":"session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'account.token_refresh': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M8","auth":"refresh_token","write":true,"idempotency":"required","request":{"type":"object","required":["sessionId","deviceId","refreshToken"],"properties":{"sessionId":"string","deviceId":"string","refreshToken":"string"}},"response":{"type":"object","required":["accessToken","refreshToken","expiresInSeconds"],"properties":{"accessToken":"string","refreshToken":"string","expiresInSeconds":"integer"}},"errors":[1001,2003,2004]},
    'account.ws_ticket': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M1","auth":"access_token","write":true,"idempotency":"required","request":{"type":"object","required":["deviceId"],"properties":{"deviceId":"string"}},"response":{"type":"object","required":["wsTicket","expiresInSeconds"],"properties":{"wsTicket":"string","expiresInSeconds":"integer"}},"errors":[1001,1003,2003]},
    'club.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M3","auth":"session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","clubId"],"properties":{"action":"string","payload":"object","clubId":"string"}},"response":{"type":"object","required":["payload"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,1003,6001,6002]},
    'club.member_page': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M8","auth":"access_token","write":false,"idempotency":"optional","request":{"type":"object","required":["clubId","limit"],"properties":{"clubId":"string","cursor":"string","limit":"integer"}},"response":{"type":"object","required":["items","hasMore"],"properties":{"items":"array","nextCursor":"string","hasMore":"boolean"}},"errors":[1001,6001,6002]},
    'club.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M3","auth":"session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'common.room.compat_state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M4","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'common.room.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M4","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object","lastServerSeq":"integer","reconnectToken":"string"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer","serverSeq":"integer"}},"errors":[1001,1003,3001,3002,3003]},
    'common.room.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M4","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["payload","stateVersion","serverSeq"],"properties":{"payload":"object","stateVersion":"integer","serverSeq":"integer"}},"errors":[]},
    'game.action': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","actionId","playVersion","expectedStateVersion","intent"],"properties":{"action":"string","payload":"object","actionId":"string","playVersion":"string","expectedStateVersion":"integer","intent":"object"}},"response":{"type":"object","required":["accepted","stateVersion","serverSeq"],"properties":{"accepted":"boolean","stateVersion":"integer","serverSeq":"integer"}},"errors":[3001,4001,4002,4003]},
    'game.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M7","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","gameId"],"properties":{"action":"string","payload":"object","gameId":"string"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'game.final_settlement': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["settlementBusinessId","resultProfileId","playerEntries"],"properties":{"settlementBusinessId":"string","resultProfileId":"string","playerEntries":"array"}},"errors":[]},
    'game.round_settlement': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["settlementBusinessId","roundNo","resultProfileId","playerEntries"],"properties":{"settlementBusinessId":"string","roundNo":"integer","resultProfileId":"string","playerEntries":"array"}},"errors":[]},
    'game.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M7","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'hall.catalog': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M8","auth":"access_token","write":false,"idempotency":"optional","request":{"type":"object","required":["clientVersion"],"properties":{"regionCode":"string","clientVersion":"string"}},"response":{"type":"object","required":["games"],"properties":{"games":"array"}},"errors":[1001,1004]},
    'hall.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M2","auth":"session","write":false,"idempotency":"optional","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,1003,2003]},
    'hall.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M2","auth":"session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'longcard.aycp.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M7","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["command","action","payload"],"properties":{"command":"string","action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'longcard.aydss.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M7","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["command","action","payload"],"properties":{"command":"string","action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'mahjong.xuezhan.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M6","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'mahjong.xuezhan.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M6","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'poker.CD201.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'poker.CD201.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["payload","stateVersion","serverSeq"],"properties":{"payload":"object","stateVersion":"integer","serverSeq":"integer"}},"errors":[]},
    'poker.LS201.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'poker.LS201.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["payload","stateVersion","serverSeq"],"properties":{"payload":"object","stateVersion":"integer","serverSeq":"integer"}},"errors":[]},
    'poker.NJ201.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'poker.NJ201.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["payload","stateVersion","serverSeq"],"properties":{"payload":"object","stateVersion":"integer","serverSeq":"integer"}},"errors":[]},
    'poker.pdk.dispatch': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["payload","stateVersion"],"properties":{"payload":"object","stateVersion":"integer"}},"errors":[1001,3001,4001,4002]},
    'poker.pdk.state_push': {"kind":"push","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M5","auth":"room_session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"errors":[]},
    'replay.perspective_page': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"session","write":false,"idempotency":"optional","request":{"type":"object","required":["action","payload","roomId","setId"],"properties":{"action":"string","payload":"object","roomId":"string","setId":"integer","afterSequence":"integer","limit":"integer"}},"response":{"type":"object","required":["items","nextSequence","hasMore"],"properties":{"items":"array","nextSequence":"integer","hasMore":"boolean"}},"errors":[1001,1003,3001,3003]},
    'replay.query': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M8","auth":"access_token","write":false,"idempotency":"optional","request":{"type":"object","required":["roomId"],"properties":{"roomId":"string"}},"response":{"type":"object","required":["viewerReplay","viewType"],"properties":{"viewerReplay":"object","viewType":"string"}},"errors":[1003,3001,6002]},
    'room.create': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M8","auth":"access_token","write":true,"idempotency":"required","request":{"type":"object","required":["gameId","roomProfileVersion","ruleSnapshotId","paymentMode"],"properties":{"gameId":"string","roomProfileVersion":"string","ruleSnapshotId":"string","paymentMode":"string","clubId":"string"}},"response":{"type":"object","required":["roomId","roomSessionToken","ruleSnapshotId"],"properties":{"roomId":"string","roomSessionToken":"string","ruleSnapshotId":"string"}},"errors":[1001,3002,5001,6002]},
    'room.dissolve_apply': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","reasonCode"],"properties":{"action":"string","payload":"object","reasonCode":"string"}},"response":{"type":"object","required":["voteId","expiresAt"],"properties":{"voteId":"string","expiresAt":"integer"}},"errors":[3001,3003,3004]},
    'room.dissolve_vote': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","voteId","agree"],"properties":{"action":"string","payload":"object","voteId":"string","agree":"boolean"}},"response":{"type":"object","required":["accepted","stateVersion"],"properties":{"accepted":"boolean","stateVersion":"integer"}},"errors":[3001,3004]},
    'room.join': {"kind":"req","direction":"client_to_server","transport":"HTTPS","version":"2.0","stage":"M8","auth":"access_token","write":true,"idempotency":"required","request":{"type":"object","required":["roomId"],"properties":{"roomId":"string"}},"response":{"type":"object","required":["roomSessionToken","playVersion","ruleSnapshotId"],"properties":{"roomSessionToken":"string","playVersion":"string","ruleSnapshotId":"string"}},"errors":[3001,3002,3003,6002]},
    'room.leave': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload"],"properties":{"action":"string","payload":"object"}},"response":{"type":"object","required":["left"],"properties":{"left":"boolean"}},"errors":[3001,3003]},
    'room.reconnect': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":false,"idempotency":"optional","request":{"type":"object","required":["action","payload","roomId","lastServerSeq","reconnectToken"],"properties":{"action":"string","payload":"object","roomId":"string","lastServerSeq":"integer","reconnectToken":"string"}},"response":{"type":"object","required":["viewerSnapshot","events","serverSeq","hasMore"],"properties":{"viewerSnapshot":"object","events":"array","serverSeq":"integer","hasMore":"boolean"}},"errors":[3001,3005]},
    'room.seat': {"kind":"req","direction":"client_to_server","transport":"WSS","version":"2.0","stage":"M8","auth":"room_session","write":true,"idempotency":"required","request":{"type":"object","required":["action","payload","seatId"],"properties":{"action":"string","payload":"object","seatId":"integer"}},"response":{"type":"object","required":["stateVersion","serverSeq"],"properties":{"stateVersion":"integer","serverSeq":"integer"}},"errors":[3001,3002,3003]},
    'system.heartbeat': {"kind":"system","direction":"bidirectional","transport":"WSS","version":"2.0","stage":"M7","auth":"session","write":false,"idempotency":"none","request":{"type":"object","required":["clientTime"],"properties":{"clientTime":"integer"}},"response":{"type":"object","required":["serverTime"],"properties":{"serverTime":"integer"}},"errors":[]},
    'system.kick_out': {"kind":"system","direction":"server_to_client","transport":"WSS","version":"2.0","stage":"M7","auth":"session","write":false,"idempotency":"none","request":{"type":"object","required":[],"properties":{}},"response":{"type":"object","required":["reasonCode"],"properties":{"reasonCode":"string","message":"string"}},"errors":[]},
} as const;
export type ProtocolDefinition = typeof ProtocolDefinitions[ProtocolId];
export interface ProtocolRequestBodies {
    'account.login': { "loginType": string; "credential": string; "deviceId": string; "clientVersion"?: string };
    'account.login_compat': { "action": string; "payload": Readonly<Record<string, unknown>>; "deviceId": string; "clientVersion"?: string };
    'account.session_dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'account.session_push': {  };
    'account.token_refresh': { "sessionId": string; "deviceId": string; "refreshToken": string };
    'account.ws_ticket': { "deviceId": string };
    'club.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>>; "clubId": string };
    'club.member_page': { "clubId": string; "cursor"?: string; "limit": number };
    'club.state_push': {  };
    'common.room.compat_state_push': {  };
    'common.room.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>>; "lastServerSeq"?: number; "reconnectToken"?: string };
    'common.room.state_push': {  };
    'game.action': { "action": string; "payload": Readonly<Record<string, unknown>>; "actionId": string; "playVersion": string; "expectedStateVersion": number; "intent": Readonly<Record<string, unknown>> };
    'game.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>>; "gameId": string };
    'game.final_settlement': {  };
    'game.round_settlement': {  };
    'game.state_push': {  };
    'hall.catalog': { "regionCode"?: string; "clientVersion": string };
    'hall.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'hall.state_push': {  };
    'longcard.aycp.dispatch': { "command": string; "action": string; "payload": Readonly<Record<string, unknown>> };
    'longcard.aydss.dispatch': { "command": string; "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xuezhan.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xuezhan.state_push': {  };
    'poker.CD201.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.CD201.state_push': {  };
    'poker.LS201.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.LS201.state_push': {  };
    'poker.NJ201.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.NJ201.state_push': {  };
    'poker.pdk.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.pdk.state_push': {  };
    'replay.perspective_page': { "action": string; "payload": Readonly<Record<string, unknown>>; "roomId": string; "setId": number; "afterSequence"?: number; "limit"?: number };
    'replay.query': { "roomId": string };
    'room.create': { "gameId": string; "roomProfileVersion": string; "ruleSnapshotId": string; "paymentMode": string; "clubId"?: string };
    'room.dissolve_apply': { "action": string; "payload": Readonly<Record<string, unknown>>; "reasonCode": string };
    'room.dissolve_vote': { "action": string; "payload": Readonly<Record<string, unknown>>; "voteId": string; "agree": boolean };
    'room.join': { "roomId": string };
    'room.leave': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'room.reconnect': { "action": string; "payload": Readonly<Record<string, unknown>>; "roomId": string; "lastServerSeq": number; "reconnectToken": string };
    'room.seat': { "action": string; "payload": Readonly<Record<string, unknown>>; "seatId": number };
    'system.heartbeat': { "clientTime": number };
    'system.kick_out': {  };
}
export interface ProtocolResponseBodies {
    'account.login': { "accessToken": string; "refreshToken": string; "userId": string; "wsTicket": string };
    'account.login_compat': { "payload": Readonly<Record<string, unknown>>; "wsTicket": string };
    'account.session_dispatch': { "payload": Readonly<Record<string, unknown>> };
    'account.session_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'account.token_refresh': { "accessToken": string; "refreshToken": string; "expiresInSeconds": number };
    'account.ws_ticket': { "wsTicket": string; "expiresInSeconds": number };
    'club.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion"?: number };
    'club.member_page': { "items": ReadonlyArray<unknown>; "nextCursor"?: string; "hasMore": boolean };
    'club.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'common.room.compat_state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'common.room.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq"?: number };
    'common.room.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'game.action': { "accepted": boolean; "stateVersion": number; "serverSeq": number };
    'game.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'game.final_settlement': { "settlementBusinessId": string; "resultProfileId": string; "playerEntries": ReadonlyArray<unknown> };
    'game.round_settlement': { "settlementBusinessId": string; "roundNo": number; "resultProfileId": string; "playerEntries": ReadonlyArray<unknown> };
    'game.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'hall.catalog': { "games": ReadonlyArray<unknown> };
    'hall.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion"?: number };
    'hall.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'longcard.aycp.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'longcard.aydss.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xuezhan.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xuezhan.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.CD201.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.CD201.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.LS201.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.LS201.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.NJ201.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.NJ201.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.pdk.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.pdk.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'replay.perspective_page': { "items": ReadonlyArray<unknown>; "nextSequence": number; "hasMore": boolean };
    'replay.query': { "viewerReplay": Readonly<Record<string, unknown>>; "viewType": string };
    'room.create': { "roomId": string; "roomSessionToken": string; "ruleSnapshotId": string };
    'room.dissolve_apply': { "voteId": string; "expiresAt": number };
    'room.dissolve_vote': { "accepted": boolean; "stateVersion": number };
    'room.join': { "roomSessionToken": string; "playVersion": string; "ruleSnapshotId": string };
    'room.leave': { "left": boolean };
    'room.reconnect': { "viewerSnapshot": Readonly<Record<string, unknown>>; "events": ReadonlyArray<unknown>; "serverSeq": number; "hasMore": boolean };
    'room.seat': { "stateVersion": number; "serverSeq": number };
    'system.heartbeat': { "serverTime": number };
    'system.kick_out': { "reasonCode": string; "message"?: string };
}
export type ProtocolRequestBody<K extends ProtocolId> = ProtocolRequestBodies[K];
export type ProtocolResponseBody<K extends ProtocolId> = ProtocolResponseBodies[K];
