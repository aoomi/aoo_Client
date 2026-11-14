// Generated from Server/protocol/aoo-protocol-v2.json. Do not edit.
import { ProtocolDefinitionsChunk000 } from './GeneratedProtocolDefinitions.000';
import { ProtocolDefinitionsChunk001 } from './GeneratedProtocolDefinitions.001';
import { ProtocolDefinitionsChunk002 } from './GeneratedProtocolDefinitions.002';
import { ProtocolDefinitionsChunk003 } from './GeneratedProtocolDefinitions.003';
import { ProtocolDefinitionsChunk004 } from './GeneratedProtocolDefinitions.004';
import { ProtocolDefinitionsChunk005 } from './GeneratedProtocolDefinitions.005';
import { ProtocolDefinitionsChunk006 } from './GeneratedProtocolDefinitions.006';
import { ProtocolDefinitionsChunk007 } from './GeneratedProtocolDefinitions.007';
import { ProtocolDefinitionsChunk008 } from './GeneratedProtocolDefinitions.008';
import { ProtocolDefinitionsChunk009 } from './GeneratedProtocolDefinitions.009';
import { ProtocolDefinitionsChunk010 } from './GeneratedProtocolDefinitions.010';
import { ProtocolDefinitionsChunk011 } from './GeneratedProtocolDefinitions.011';
import { ProtocolDefinitionsChunk012 } from './GeneratedProtocolDefinitions.012';
import { ProtocolDefinitionsChunk013 } from './GeneratedProtocolDefinitions.013';
import { ProtocolDefinitionsChunk014 } from './GeneratedProtocolDefinitions.014';
import { ProtocolDefinitionsChunk015 } from './GeneratedProtocolDefinitions.015';
import { ProtocolDefinitionsChunk016 } from './GeneratedProtocolDefinitions.016';
import { ProtocolDefinitionsChunk017 } from './GeneratedProtocolDefinitions.017';

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
    MAHJONG_AFMJ_DISPATCH: 'mahjong.afmj.dispatch',
    MAHJONG_AFMJ_STATE_PUSH: 'mahjong.afmj.state_push',
    MAHJONG_AHHBMJ_DISPATCH: 'mahjong.ahhbmj.dispatch',
    MAHJONG_AHHBMJ_STATE_PUSH: 'mahjong.ahhbmj.state_push',
    MAHJONG_AHHNMJ_DISPATCH: 'mahjong.ahhnmj.dispatch',
    MAHJONG_AHHNMJ_STATE_PUSH: 'mahjong.ahhnmj.state_push',
    MAHJONG_AHMJ_DISPATCH: 'mahjong.ahmj.dispatch',
    MAHJONG_AHMJ_STATE_PUSH: 'mahjong.ahmj.state_push',
    MAHJONG_AK159MJ_DISPATCH: 'mahjong.ak159mj.dispatch',
    MAHJONG_AK159MJ_STATE_PUSH: 'mahjong.ak159mj.state_push',
    MAHJONG_AQMJ_DISPATCH: 'mahjong.aqmj.dispatch',
    MAHJONG_AQMJ_STATE_PUSH: 'mahjong.aqmj.state_push',
    MAHJONG_ASMJ_DISPATCH: 'mahjong.asmj.dispatch',
    MAHJONG_ASMJ_STATE_PUSH: 'mahjong.asmj.state_push',
    MAHJONG_AYMJ_DISPATCH: 'mahjong.aymj.dispatch',
    MAHJONG_AYMJ_STATE_PUSH: 'mahjong.aymj.state_push',
    MAHJONG_BAMJ_DISPATCH: 'mahjong.bamj.dispatch',
    MAHJONG_BAMJ_STATE_PUSH: 'mahjong.bamj.state_push',
    MAHJONG_BDJHMJ_DISPATCH: 'mahjong.bdjhmj.dispatch',
    MAHJONG_BDJHMJ_STATE_PUSH: 'mahjong.bdjhmj.state_push',
    MAHJONG_BDMJ_DISPATCH: 'mahjong.bdmj.dispatch',
    MAHJONG_BDMJ_STATE_PUSH: 'mahjong.bdmj.state_push',
    MAHJONG_BDYXMJ_DISPATCH: 'mahjong.bdyxmj.dispatch',
    MAHJONG_BDYXMJ_STATE_PUSH: 'mahjong.bdyxmj.state_push',
    MAHJONG_BFMJ_DISPATCH: 'mahjong.bfmj.dispatch',
    MAHJONG_BFMJ_STATE_PUSH: 'mahjong.bfmj.state_push',
    MAHJONG_BSMJ_DISPATCH: 'mahjong.bsmj.dispatch',
    MAHJONG_BSMJ_STATE_PUSH: 'mahjong.bsmj.state_push',
    MAHJONG_BZMJ_DISPATCH: 'mahjong.bzmj.dispatch',
    MAHJONG_BZMJ_STATE_PUSH: 'mahjong.bzmj.state_push',
    MAHJONG_BZQZMJ_DISPATCH: 'mahjong.bzqzmj.dispatch',
    MAHJONG_BZQZMJ_STATE_PUSH: 'mahjong.bzqzmj.state_push',
    MAHJONG_BZTDH_DISPATCH: 'mahjong.bztdh.dispatch',
    MAHJONG_BZTDH_STATE_PUSH: 'mahjong.bztdh.state_push',
    MAHJONG_CAOOSZMJ_DISPATCH: 'mahjong.caooszmj.dispatch',
    MAHJONG_CAOOSZMJ_STATE_PUSH: 'mahjong.caooszmj.state_push',
    MAHJONG_CCMJ_DISPATCH: 'mahjong.ccmj.dispatch',
    MAHJONG_CCMJ_STATE_PUSH: 'mahjong.ccmj.state_push',
    MAHJONG_CHENGDU1001_DISPATCH: 'mahjong.chengdu1001.dispatch',
    MAHJONG_CHENGDU1001_STATE_PUSH: 'mahjong.chengdu1001.state_push',
    MAHJONG_CHMJ_DISPATCH: 'mahjong.chmj.dispatch',
    MAHJONG_CHMJ_STATE_PUSH: 'mahjong.chmj.state_push',
    MAHJONG_CNMJ_DISPATCH: 'mahjong.cnmj.dispatch',
    MAHJONG_CNMJ_STATE_PUSH: 'mahjong.cnmj.state_push',
    MAHJONG_CSMJ_DISPATCH: 'mahjong.csmj.dispatch',
    MAHJONG_CSMJ_STATE_PUSH: 'mahjong.csmj.state_push',
    MAHJONG_CXMJ_DISPATCH: 'mahjong.cxmj.dispatch',
    MAHJONG_CXMJ_STATE_PUSH: 'mahjong.cxmj.state_push',
    MAHJONG_CXYXMJ_DISPATCH: 'mahjong.cxyxmj.dispatch',
    MAHJONG_CXYXMJ_STATE_PUSH: 'mahjong.cxyxmj.state_push',
    MAHJONG_CYLYMJ_DISPATCH: 'mahjong.cylymj.dispatch',
    MAHJONG_CYLYMJ_STATE_PUSH: 'mahjong.cylymj.state_push',
    MAHJONG_CZCZMJ_DISPATCH: 'mahjong.czczmj.dispatch',
    MAHJONG_CZCZMJ_STATE_PUSH: 'mahjong.czczmj.state_push',
    MAHJONG_CZDZMJ_DISPATCH: 'mahjong.czdzmj.dispatch',
    MAHJONG_CZDZMJ_STATE_PUSH: 'mahjong.czdzmj.state_push',
    MAHJONG_CZMJ_DISPATCH: 'mahjong.czmj.dispatch',
    MAHJONG_CZMJ_STATE_PUSH: 'mahjong.czmj.state_push',
    MAHJONG_DCWDMJ_DISPATCH: 'mahjong.dcwdmj.dispatch',
    MAHJONG_DCWDMJ_STATE_PUSH: 'mahjong.dcwdmj.state_push',
    MAHJONG_DCZBMJ_DISPATCH: 'mahjong.dczbmj.dispatch',
    MAHJONG_DCZBMJ_STATE_PUSH: 'mahjong.dczbmj.state_push',
    MAHJONG_DEMOMJ_DISPATCH: 'mahjong.demomj.dispatch',
    MAHJONG_DEMOMJ_STATE_PUSH: 'mahjong.demomj.state_push',
    MAHJONG_DKGMJ_DISPATCH: 'mahjong.dkgmj.dispatch',
    MAHJONG_DKGMJ_STATE_PUSH: 'mahjong.dkgmj.state_push',
    MAHJONG_DLAOOMJ_DISPATCH: 'mahjong.dlaoomj.dispatch',
    MAHJONG_DLAOOMJ_STATE_PUSH: 'mahjong.dlaoomj.state_push',
    MAHJONG_DNMJ_DISPATCH: 'mahjong.dnmj.dispatch',
    MAHJONG_DNMJ_STATE_PUSH: 'mahjong.dnmj.state_push',
    MAHJONG_DPHMJ_DISPATCH: 'mahjong.dphmj.dispatch',
    MAHJONG_DPHMJ_STATE_PUSH: 'mahjong.dphmj.state_push',
    MAHJONG_DSMJ_DISPATCH: 'mahjong.dsmj.dispatch',
    MAHJONG_DSMJ_STATE_PUSH: 'mahjong.dsmj.state_push',
    MAHJONG_DTLGFMJ_DISPATCH: 'mahjong.dtlgfmj.dispatch',
    MAHJONG_DTLGFMJ_STATE_PUSH: 'mahjong.dtlgfmj.state_push',
    MAHJONG_DTMJ_DISPATCH: 'mahjong.dtmj.dispatch',
    MAHJONG_DTMJ_STATE_PUSH: 'mahjong.dtmj.state_push',
    MAHJONG_DXBJMJ_DISPATCH: 'mahjong.dxbjmj.dispatch',
    MAHJONG_DXBJMJ_STATE_PUSH: 'mahjong.dxbjmj.state_push',
    MAHJONG_DYMJ_DISPATCH: 'mahjong.dymj.dispatch',
    MAHJONG_DYMJ_STATE_PUSH: 'mahjong.dymj.state_push',
    MAHJONG_DZMJ_DISPATCH: 'mahjong.dzmj.dispatch',
    MAHJONG_DZMJ_STATE_PUSH: 'mahjong.dzmj.state_push',
    MAHJONG_DZSJZMJ_DISPATCH: 'mahjong.dzsjzmj.dispatch',
    MAHJONG_DZSJZMJ_STATE_PUSH: 'mahjong.dzsjzmj.state_push',
    MAHJONG_FCMJ_DISPATCH: 'mahjong.fcmj.dispatch',
    MAHJONG_FCMJ_STATE_PUSH: 'mahjong.fcmj.state_push',
    MAHJONG_FCTDHMJ_DISPATCH: 'mahjong.fctdhmj.dispatch',
    MAHJONG_FCTDHMJ_STATE_PUSH: 'mahjong.fctdhmj.state_push',
    MAHJONG_FDMJ_DISPATCH: 'mahjong.fdmj.dispatch',
    MAHJONG_FDMJ_STATE_PUSH: 'mahjong.fdmj.state_push',
    MAHJONG_FJYXMJ_DISPATCH: 'mahjong.fjyxmj.dispatch',
    MAHJONG_FJYXMJ_STATE_PUSH: 'mahjong.fjyxmj.state_push',
    MAHJONG_FXMJ_DISPATCH: 'mahjong.fxmj.dispatch',
    MAHJONG_FXMJ_STATE_PUSH: 'mahjong.fxmj.state_push',
    MAHJONG_FYDDZMJ_DISPATCH: 'mahjong.fyddzmj.dispatch',
    MAHJONG_FYDDZMJ_STATE_PUSH: 'mahjong.fyddzmj.state_push',
    MAHJONG_FYMJ_DISPATCH: 'mahjong.fymj.dispatch',
    MAHJONG_FYMJ_STATE_PUSH: 'mahjong.fymj.state_push',
    MAHJONG_FZGCMJ_DISPATCH: 'mahjong.fzgcmj.dispatch',
    MAHJONG_FZGCMJ_STATE_PUSH: 'mahjong.fzgcmj.state_push',
    MAHJONG_FZJXMJ_DISPATCH: 'mahjong.fzjxmj.dispatch',
    MAHJONG_FZJXMJ_STATE_PUSH: 'mahjong.fzjxmj.state_push',
    MAHJONG_FZMJ_DISPATCH: 'mahjong.fzmj.dispatch',
    MAHJONG_FZMJ_STATE_PUSH: 'mahjong.fzmj.state_push',
    MAHJONG_GAMJ_DISPATCH: 'mahjong.gamj.dispatch',
    MAHJONG_GAMJ_STATE_PUSH: 'mahjong.gamj.state_push',
    MAHJONG_GCBGMJ_DISPATCH: 'mahjong.gcbgmj.dispatch',
    MAHJONG_GCBGMJ_STATE_PUSH: 'mahjong.gcbgmj.state_push',
    MAHJONG_GCMJ_DISPATCH: 'mahjong.gcmj.dispatch',
    MAHJONG_GCMJ_STATE_PUSH: 'mahjong.gcmj.state_push',
    MAHJONG_GDCZMJ_DISPATCH: 'mahjong.gdczmj.dispatch',
    MAHJONG_GDCZMJ_STATE_PUSH: 'mahjong.gdczmj.state_push',
    MAHJONG_GDJYMJ_DISPATCH: 'mahjong.gdjymj.dispatch',
    MAHJONG_GDJYMJ_STATE_PUSH: 'mahjong.gdjymj.state_push',
    MAHJONG_GDMJ_DISPATCH: 'mahjong.gdmj.dispatch',
    MAHJONG_GDMJ_STATE_PUSH: 'mahjong.gdmj.state_push',
    MAHJONG_GFT258MJ_DISPATCH: 'mahjong.gft258mj.dispatch',
    MAHJONG_GFT258MJ_STATE_PUSH: 'mahjong.gft258mj.state_push',
    MAHJONG_GJMJ_DISPATCH: 'mahjong.gjmj.dispatch',
    MAHJONG_GJMJ_STATE_PUSH: 'mahjong.gjmj.state_push',
    MAHJONG_GLQZMJ_DISPATCH: 'mahjong.glqzmj.dispatch',
    MAHJONG_GLQZMJ_STATE_PUSH: 'mahjong.glqzmj.state_push',
    MAHJONG_GNMJ_DISPATCH: 'mahjong.gnmj.dispatch',
    MAHJONG_GNMJ_STATE_PUSH: 'mahjong.gnmj.state_push',
    MAHJONG_GSJMJ_DISPATCH: 'mahjong.gsjmj.dispatch',
    MAHJONG_GSJMJ_STATE_PUSH: 'mahjong.gsjmj.state_push',
    MAHJONG_GSLZMJ_DISPATCH: 'mahjong.gslzmj.dispatch',
    MAHJONG_GSLZMJ_STATE_PUSH: 'mahjong.gslzmj.state_push',
    MAHJONG_GSMJ_DISPATCH: 'mahjong.gsmj.dispatch',
    MAHJONG_GSMJ_STATE_PUSH: 'mahjong.gsmj.state_push',
    MAHJONG_GXMJ_DISPATCH: 'mahjong.gxmj.dispatch',
    MAHJONG_GXMJ_STATE_PUSH: 'mahjong.gxmj.state_push',
    MAHJONG_GYMJ_DISPATCH: 'mahjong.gymj.dispatch',
    MAHJONG_GYMJ_STATE_PUSH: 'mahjong.gymj.state_push',
    MAHJONG_GYZJMJ_DISPATCH: 'mahjong.gyzjmj.dispatch',
    MAHJONG_GYZJMJ_STATE_PUSH: 'mahjong.gyzjmj.state_push',
    MAHJONG_GZMJ_DISPATCH: 'mahjong.gzmj.dispatch',
    MAHJONG_GZMJ_STATE_PUSH: 'mahjong.gzmj.state_push',
    MAHJONG_HAMJ_DISPATCH: 'mahjong.hamj.dispatch',
    MAHJONG_HAMJ_STATE_PUSH: 'mahjong.hamj.state_push',
    MAHJONG_HAXYMJ_DISPATCH: 'mahjong.haxymj.dispatch',
    MAHJONG_HAXYMJ_STATE_PUSH: 'mahjong.haxymj.state_push',
    MAHJONG_HBHBMJ_DISPATCH: 'mahjong.hbhbmj.dispatch',
    MAHJONG_HBHBMJ_STATE_PUSH: 'mahjong.hbhbmj.state_push',
    MAHJONG_HBMJ_DISPATCH: 'mahjong.hbmj.dispatch',
    MAHJONG_HBMJ_STATE_PUSH: 'mahjong.hbmj.state_push',
    MAHJONG_HBTDHMJ_DISPATCH: 'mahjong.hbtdhmj.dispatch',
    MAHJONG_HBTDHMJ_STATE_PUSH: 'mahjong.hbtdhmj.state_push',
    MAHJONG_HBWHMJ_DISPATCH: 'mahjong.hbwhmj.dispatch',
    MAHJONG_HBWHMJ_STATE_PUSH: 'mahjong.hbwhmj.state_push',
    MAHJONG_HBYXMJ_DISPATCH: 'mahjong.hbyxmj.dispatch',
    MAHJONG_HBYXMJ_STATE_PUSH: 'mahjong.hbyxmj.state_push',
    MAHJONG_HEBMJ_DISPATCH: 'mahjong.hebmj.dispatch',
    MAHJONG_HEBMJ_STATE_PUSH: 'mahjong.hebmj.state_push',
    MAHJONG_HFBZMJ_DISPATCH: 'mahjong.hfbzmj.dispatch',
    MAHJONG_HFBZMJ_STATE_PUSH: 'mahjong.hfbzmj.state_push',
    MAHJONG_HFMJ_DISPATCH: 'mahjong.hfmj.dispatch',
    MAHJONG_HFMJ_STATE_PUSH: 'mahjong.hfmj.state_push',
    MAHJONG_HHHGW_DISPATCH: 'mahjong.hhhgw.dispatch',
    MAHJONG_HHHGW_STATE_PUSH: 'mahjong.hhhgw.state_push',
    MAHJONG_HJMJ_DISPATCH: 'mahjong.hjmj.dispatch',
    MAHJONG_HJMJ_STATE_PUSH: 'mahjong.hjmj.state_push',
    MAHJONG_HLDMJ_DISPATCH: 'mahjong.hldmj.dispatch',
    MAHJONG_HLDMJ_STATE_PUSH: 'mahjong.hldmj.state_push',
    MAHJONG_HNAYMJ_DISPATCH: 'mahjong.hnaymj.dispatch',
    MAHJONG_HNAYMJ_STATE_PUSH: 'mahjong.hnaymj.state_push',
    MAHJONG_HNCSMJ_DISPATCH: 'mahjong.hncsmj.dispatch',
    MAHJONG_HNCSMJ_STATE_PUSH: 'mahjong.hncsmj.state_push',
    MAHJONG_HNHBMJ_DISPATCH: 'mahjong.hnhbmj.dispatch',
    MAHJONG_HNHBMJ_STATE_PUSH: 'mahjong.hnhbmj.state_push',
    MAHJONG_HNJYMJ_DISPATCH: 'mahjong.hnjymj.dispatch',
    MAHJONG_HNJYMJ_STATE_PUSH: 'mahjong.hnjymj.state_push',
    MAHJONG_HNJZMJ_DISPATCH: 'mahjong.hnjzmj.dispatch',
    MAHJONG_HNJZMJ_STATE_PUSH: 'mahjong.hnjzmj.state_push',
    MAHJONG_HNMJ_DISPATCH: 'mahjong.hnmj.dispatch',
    MAHJONG_HNMJ_STATE_PUSH: 'mahjong.hnmj.state_push',
    MAHJONG_HNPDSMJ_DISPATCH: 'mahjong.hnpdsmj.dispatch',
    MAHJONG_HNPDSMJ_STATE_PUSH: 'mahjong.hnpdsmj.state_push',
    MAHJONG_HNSYMJ_DISPATCH: 'mahjong.hnsymj.dispatch',
    MAHJONG_HNSYMJ_STATE_PUSH: 'mahjong.hnsymj.state_push',
    MAHJONG_HNXCMJ_DISPATCH: 'mahjong.hnxcmj.dispatch',
    MAHJONG_HNXCMJ_STATE_PUSH: 'mahjong.hnxcmj.state_push',
    MAHJONG_HNXYMJ_DISPATCH: 'mahjong.hnxymj.dispatch',
    MAHJONG_HNXYMJ_STATE_PUSH: 'mahjong.hnxymj.state_push',
    MAHJONG_HNYJMJ_DISPATCH: 'mahjong.hnyjmj.dispatch',
    MAHJONG_HNYJMJ_STATE_PUSH: 'mahjong.hnyjmj.state_push',
    MAHJONG_HNZZMJ_DISPATCH: 'mahjong.hnzzmj.dispatch',
    MAHJONG_HNZZMJ_STATE_PUSH: 'mahjong.hnzzmj.state_push',
    MAHJONG_HSMJ_DISPATCH: 'mahjong.hsmj.dispatch',
    MAHJONG_HSMJ_STATE_PUSH: 'mahjong.hsmj.state_push',
    MAHJONG_HSTDHMJ_DISPATCH: 'mahjong.hstdhmj.dispatch',
    MAHJONG_HSTDHMJ_STATE_PUSH: 'mahjong.hstdhmj.state_push',
    MAHJONG_HTMJ_DISPATCH: 'mahjong.htmj.dispatch',
    MAHJONG_HTMJ_STATE_PUSH: 'mahjong.htmj.state_push',
    MAHJONG_HYHSMJ_DISPATCH: 'mahjong.hyhsmj.dispatch',
    MAHJONG_HYHSMJ_STATE_PUSH: 'mahjong.hyhsmj.state_push',
    MAHJONG_HYLYMJ_DISPATCH: 'mahjong.hylymj.dispatch',
    MAHJONG_HYLYMJ_STATE_PUSH: 'mahjong.hylymj.state_push',
    MAHJONG_HZBDMJ_DISPATCH: 'mahjong.hzbdmj.dispatch',
    MAHJONG_HZBDMJ_STATE_PUSH: 'mahjong.hzbdmj.state_push',
    MAHJONG_HZJDMJ_DISPATCH: 'mahjong.hzjdmj.dispatch',
    MAHJONG_HZJDMJ_STATE_PUSH: 'mahjong.hzjdmj.state_push',
    MAHJONG_HZMJ_DISPATCH: 'mahjong.hzmj.dispatch',
    MAHJONG_HZMJ_STATE_PUSH: 'mahjong.hzmj.state_push',
    MAHJONG_HZWMJ_DISPATCH: 'mahjong.hzwmj.dispatch',
    MAHJONG_HZWMJ_STATE_PUSH: 'mahjong.hzwmj.state_push',
    MAHJONG_JAMJ_DISPATCH: 'mahjong.jamj.dispatch',
    MAHJONG_JAMJ_STATE_PUSH: 'mahjong.jamj.state_push',
    MAHJONG_JAYXMJ_DISPATCH: 'mahjong.jayxmj.dispatch',
    MAHJONG_JAYXMJ_STATE_PUSH: 'mahjong.jayxmj.state_push',
    MAHJONG_JCAHMJ_DISPATCH: 'mahjong.jcahmj.dispatch',
    MAHJONG_JCAHMJ_STATE_PUSH: 'mahjong.jcahmj.state_push',
    MAHJONG_JCHHMJ_DISPATCH: 'mahjong.jchhmj.dispatch',
    MAHJONG_JCHHMJ_STATE_PUSH: 'mahjong.jchhmj.state_push',
    MAHJONG_JCMJ_DISPATCH: 'mahjong.jcmj.dispatch',
    MAHJONG_JCMJ_STATE_PUSH: 'mahjong.jcmj.state_push',
    MAHJONG_JDMJ_DISPATCH: 'mahjong.jdmj.dispatch',
    MAHJONG_JDMJ_STATE_PUSH: 'mahjong.jdmj.state_push',
    MAHJONG_JDZMJ_DISPATCH: 'mahjong.jdzmj.dispatch',
    MAHJONG_JDZMJ_STATE_PUSH: 'mahjong.jdzmj.state_push',
    MAHJONG_JJMJ_DISPATCH: 'mahjong.jjmj.dispatch',
    MAHJONG_JJMJ_STATE_PUSH: 'mahjong.jjmj.state_push',
    MAHJONG_JLMJ_DISPATCH: 'mahjong.jlmj.dispatch',
    MAHJONG_JLMJ_STATE_PUSH: 'mahjong.jlmj.state_push',
    MAHJONG_JMGGHMJ_DISPATCH: 'mahjong.jmgghmj.dispatch',
    MAHJONG_JMGGHMJ_STATE_PUSH: 'mahjong.jmgghmj.state_push',
    MAHJONG_JMHHMJ_DISPATCH: 'mahjong.jmhhmj.dispatch',
    MAHJONG_JMHHMJ_STATE_PUSH: 'mahjong.jmhhmj.state_push',
    MAHJONG_JMJSMJ_DISPATCH: 'mahjong.jmjsmj.dispatch',
    MAHJONG_JMJSMJ_STATE_PUSH: 'mahjong.jmjsmj.state_push',
    MAHJONG_JMSKMJ_DISPATCH: 'mahjong.jmskmj.dispatch',
    MAHJONG_JMSKMJ_STATE_PUSH: 'mahjong.jmskmj.state_push',
    MAHJONG_JNMJ_DISPATCH: 'mahjong.jnmj.dispatch',
    MAHJONG_JNMJ_STATE_PUSH: 'mahjong.jnmj.state_push',
    MAHJONG_JSCZMJ_DISPATCH: 'mahjong.jsczmj.dispatch',
    MAHJONG_JSCZMJ_STATE_PUSH: 'mahjong.jsczmj.state_push',
    MAHJONG_JSGYMJ_DISPATCH: 'mahjong.jsgymj.dispatch',
    MAHJONG_JSGYMJ_STATE_PUSH: 'mahjong.jsgymj.state_push',
    MAHJONG_JSHAMJ_DISPATCH: 'mahjong.jshamj.dispatch',
    MAHJONG_JSHAMJ_STATE_PUSH: 'mahjong.jshamj.state_push',
    MAHJONG_JSMJ_DISPATCH: 'mahjong.jsmj.dispatch',
    MAHJONG_JSMJ_STATE_PUSH: 'mahjong.jsmj.state_push',
    MAHJONG_JSNYZMJ_DISPATCH: 'mahjong.jsnyzmj.dispatch',
    MAHJONG_JSNYZMJ_STATE_PUSH: 'mahjong.jsnyzmj.state_push',
    MAHJONG_JSSNMJ_DISPATCH: 'mahjong.jssnmj.dispatch',
    MAHJONG_JSSNMJ_STATE_PUSH: 'mahjong.jssnmj.state_push',
    MAHJONG_JSSQMJ_DISPATCH: 'mahjong.jssqmj.dispatch',
    MAHJONG_JSSQMJ_STATE_PUSH: 'mahjong.jssqmj.state_push',
    MAHJONG_JSTDHMJ_DISPATCH: 'mahjong.jstdhmj.dispatch',
    MAHJONG_JSTDHMJ_STATE_PUSH: 'mahjong.jstdhmj.state_push',
    MAHJONG_JSXYMJ_DISPATCH: 'mahjong.jsxymj.dispatch',
    MAHJONG_JSXYMJ_STATE_PUSH: 'mahjong.jsxymj.state_push',
    MAHJONG_JSYCMJ_DISPATCH: 'mahjong.jsycmj.dispatch',
    MAHJONG_JSYCMJ_STATE_PUSH: 'mahjong.jsycmj.state_push',
    MAHJONG_JSYZMJ_DISPATCH: 'mahjong.jsyzmj.dispatch',
    MAHJONG_JSYZMJ_STATE_PUSH: 'mahjong.jsyzmj.state_push',
    MAHJONG_JTMJ_DISPATCH: 'mahjong.jtmj.dispatch',
    MAHJONG_JTMJ_STATE_PUSH: 'mahjong.jtmj.state_push',
    MAHJONG_JXFZMJ_DISPATCH: 'mahjong.jxfzmj.dispatch',
    MAHJONG_JXFZMJ_STATE_PUSH: 'mahjong.jxfzmj.state_push',
    MAHJONG_JXMJ_DISPATCH: 'mahjong.jxmj.dispatch',
    MAHJONG_JXMJ_STATE_PUSH: 'mahjong.jxmj.state_push',
    MAHJONG_JXNDMJ_DISPATCH: 'mahjong.jxndmj.dispatch',
    MAHJONG_JXNDMJ_STATE_PUSH: 'mahjong.jxndmj.state_push',
    MAHJONG_JXXYMJ_DISPATCH: 'mahjong.jxxymj.dispatch',
    MAHJONG_JXXYMJ_STATE_PUSH: 'mahjong.jxxymj.state_push',
    MAHJONG_JYESSZ_DISPATCH: 'mahjong.jyessz.dispatch',
    MAHJONG_JYESSZ_STATE_PUSH: 'mahjong.jyessz.state_push',
    MAHJONG_JYMJ_DISPATCH: 'mahjong.jymj.dispatch',
    MAHJONG_JYMJ_STATE_PUSH: 'mahjong.jymj.state_push',
    MAHJONG_JZMJ_DISPATCH: 'mahjong.jzmj.dispatch',
    MAHJONG_JZMJ_STATE_PUSH: 'mahjong.jzmj.state_push',
    MAHJONG_JZWZMJ_DISPATCH: 'mahjong.jzwzmj.dispatch',
    MAHJONG_JZWZMJ_STATE_PUSH: 'mahjong.jzwzmj.state_push',
    MAHJONG_KFMJ_DISPATCH: 'mahjong.kfmj.dispatch',
    MAHJONG_KFMJ_STATE_PUSH: 'mahjong.kfmj.state_push',
    MAHJONG_KLMJ_DISPATCH: 'mahjong.klmj.dispatch',
    MAHJONG_KLMJ_STATE_PUSH: 'mahjong.klmj.state_push',
    MAHJONG_KSMJ_DISPATCH: 'mahjong.ksmj.dispatch',
    MAHJONG_KSMJ_STATE_PUSH: 'mahjong.ksmj.state_push',
    MAHJONG_LAMJ_DISPATCH: 'mahjong.lamj.dispatch',
    MAHJONG_LAMJ_STATE_PUSH: 'mahjong.lamj.state_push',
    MAHJONG_LBHZMJ_DISPATCH: 'mahjong.lbhzmj.dispatch',
    MAHJONG_LBHZMJ_STATE_PUSH: 'mahjong.lbhzmj.state_push',
    MAHJONG_LBMJ_DISPATCH: 'mahjong.lbmj.dispatch',
    MAHJONG_LBMJ_STATE_PUSH: 'mahjong.lbmj.state_push',
    MAHJONG_LCMJ_DISPATCH: 'mahjong.lcmj.dispatch',
    MAHJONG_LCMJ_STATE_PUSH: 'mahjong.lcmj.state_push',
    MAHJONG_LFPHMJ_DISPATCH: 'mahjong.lfphmj.dispatch',
    MAHJONG_LFPHMJ_STATE_PUSH: 'mahjong.lfphmj.state_push',
    MAHJONG_LGMJ_DISPATCH: 'mahjong.lgmj.dispatch',
    MAHJONG_LGMJ_STATE_PUSH: 'mahjong.lgmj.state_push',
    MAHJONG_LHGMMJ_DISPATCH: 'mahjong.lhgmmj.dispatch',
    MAHJONG_LHGMMJ_STATE_PUSH: 'mahjong.lhgmmj.state_push',
    MAHJONG_LHMJ_DISPATCH: 'mahjong.lhmj.dispatch',
    MAHJONG_LHMJ_STATE_PUSH: 'mahjong.lhmj.state_push',
    MAHJONG_LKMJ_DISPATCH: 'mahjong.lkmj.dispatch',
    MAHJONG_LKMJ_STATE_PUSH: 'mahjong.lkmj.state_push',
    MAHJONG_LLFYMJ_DISPATCH: 'mahjong.llfymj.dispatch',
    MAHJONG_LLFYMJ_STATE_PUSH: 'mahjong.llfymj.state_push',
    MAHJONG_LNJZMJ_DISPATCH: 'mahjong.lnjzmj.dispatch',
    MAHJONG_LNJZMJ_STATE_PUSH: 'mahjong.lnjzmj.state_push',
    MAHJONG_LNMJ_DISPATCH: 'mahjong.lnmj.dispatch',
    MAHJONG_LNMJ_STATE_PUSH: 'mahjong.lnmj.state_push',
    MAHJONG_LNSYMJ_DISPATCH: 'mahjong.lnsymj.dispatch',
    MAHJONG_LNSYMJ_STATE_PUSH: 'mahjong.lnsymj.state_push',
    MAHJONG_LPMJ_DISPATCH: 'mahjong.lpmj.dispatch',
    MAHJONG_LPMJ_STATE_PUSH: 'mahjong.lpmj.state_push',
    MAHJONG_LPSMJ_DISPATCH: 'mahjong.lpsmj.dispatch',
    MAHJONG_LPSMJ_STATE_PUSH: 'mahjong.lpsmj.state_push',
    MAHJONG_LS13579_DISPATCH: 'mahjong.ls13579.dispatch',
    MAHJONG_LS13579_STATE_PUSH: 'mahjong.ls13579.state_push',
    MAHJONG_LSKJJMJ_DISPATCH: 'mahjong.lskjjmj.dispatch',
    MAHJONG_LSKJJMJ_STATE_PUSH: 'mahjong.lskjjmj.state_push',
    MAHJONG_LSLWZMJ_DISPATCH: 'mahjong.lslwzmj.dispatch',
    MAHJONG_LSLWZMJ_STATE_PUSH: 'mahjong.lslwzmj.state_push',
    MAHJONG_LSMJ_DISPATCH: 'mahjong.lsmj.dispatch',
    MAHJONG_LSMJ_STATE_PUSH: 'mahjong.lsmj.state_push',
    MAHJONG_LSXZMJ_DISPATCH: 'mahjong.lsxzmj.dispatch',
    MAHJONG_LSXZMJ_STATE_PUSH: 'mahjong.lsxzmj.state_push',
    MAHJONG_LSYJMJ_DISPATCH: 'mahjong.lsyjmj.dispatch',
    MAHJONG_LSYJMJ_STATE_PUSH: 'mahjong.lsyjmj.state_push',
    MAHJONG_LWMJ_DISPATCH: 'mahjong.lwmj.dispatch',
    MAHJONG_LWMJ_STATE_PUSH: 'mahjong.lwmj.state_push',
    MAHJONG_LXMJ_DISPATCH: 'mahjong.lxmj.dispatch',
    MAHJONG_LXMJ_STATE_PUSH: 'mahjong.lxmj.state_push',
    MAHJONG_LYGCMJ_DISPATCH: 'mahjong.lygcmj.dispatch',
    MAHJONG_LYGCMJ_STATE_PUSH: 'mahjong.lygcmj.state_push',
    MAHJONG_LYGMJ_DISPATCH: 'mahjong.lygmj.dispatch',
    MAHJONG_LYGMJ_STATE_PUSH: 'mahjong.lygmj.state_push',
    MAHJONG_LYMJ_DISPATCH: 'mahjong.lymj.dispatch',
    MAHJONG_LYMJ_STATE_PUSH: 'mahjong.lymj.state_push',
    MAHJONG_LZMJ_DISPATCH: 'mahjong.lzmj.dispatch',
    MAHJONG_LZMJ_STATE_PUSH: 'mahjong.lzmj.state_push',
    MAHJONG_LZXZMJ_DISPATCH: 'mahjong.lzxzmj.dispatch',
    MAHJONG_LZXZMJ_STATE_PUSH: 'mahjong.lzxzmj.state_push',
    MAHJONG_MASMJ_DISPATCH: 'mahjong.masmj.dispatch',
    MAHJONG_MASMJ_STATE_PUSH: 'mahjong.masmj.state_push',
    MAHJONG_MMMJ_DISPATCH: 'mahjong.mmmj.dispatch',
    MAHJONG_MMMJ_STATE_PUSH: 'mahjong.mmmj.state_push',
    MAHJONG_MSMJ_DISPATCH: 'mahjong.msmj.dispatch',
    MAHJONG_MSMJ_STATE_PUSH: 'mahjong.msmj.state_push',
    MAHJONG_MYMJ_DISPATCH: 'mahjong.mymj.dispatch',
    MAHJONG_MYMJ_STATE_PUSH: 'mahjong.mymj.state_push',
    MAHJONG_MZMJ_DISPATCH: 'mahjong.mzmj.dispatch',
    MAHJONG_MZMJ_STATE_PUSH: 'mahjong.mzmj.state_push',
    MAHJONG_NAMJ_DISPATCH: 'mahjong.namj.dispatch',
    MAHJONG_NAMJ_STATE_PUSH: 'mahjong.namj.state_push',
    MAHJONG_NBCXMJ_DISPATCH: 'mahjong.nbcxmj.dispatch',
    MAHJONG_NBCXMJ_STATE_PUSH: 'mahjong.nbcxmj.state_push',
    MAHJONG_NBMJ_DISPATCH: 'mahjong.nbmj.dispatch',
    MAHJONG_NBMJ_STATE_PUSH: 'mahjong.nbmj.state_push',
    MAHJONG_NCAYMJ_DISPATCH: 'mahjong.ncaymj.dispatch',
    MAHJONG_NCAYMJ_STATE_PUSH: 'mahjong.ncaymj.state_push',
    MAHJONG_NCMJ_DISPATCH: 'mahjong.ncmj.dispatch',
    MAHJONG_NCMJ_STATE_PUSH: 'mahjong.ncmj.state_push',
    MAHJONG_NDMJ_DISPATCH: 'mahjong.ndmj.dispatch',
    MAHJONG_NDMJ_STATE_PUSH: 'mahjong.ndmj.state_push',
    MAHJONG_NHMJ_DISPATCH: 'mahjong.nhmj.dispatch',
    MAHJONG_NHMJ_STATE_PUSH: 'mahjong.nhmj.state_push',
    MAHJONG_NJLHMJ_DISPATCH: 'mahjong.njlhmj.dispatch',
    MAHJONG_NJLHMJ_STATE_PUSH: 'mahjong.njlhmj.state_push',
    MAHJONG_NJMJ_DISPATCH: 'mahjong.njmj.dispatch',
    MAHJONG_NJMJ_STATE_PUSH: 'mahjong.njmj.state_push',
    MAHJONG_NKBHMJ_DISPATCH: 'mahjong.nkbhmj.dispatch',
    MAHJONG_NKBHMJ_STATE_PUSH: 'mahjong.nkbhmj.state_push',
    MAHJONG_NMGYZMJ_DISPATCH: 'mahjong.nmgyzmj.dispatch',
    MAHJONG_NMGYZMJ_STATE_PUSH: 'mahjong.nmgyzmj.state_push',
    MAHJONG_NPGZMJ_DISPATCH: 'mahjong.npgzmj.dispatch',
    MAHJONG_NPGZMJ_STATE_PUSH: 'mahjong.npgzmj.state_push',
    MAHJONG_NPMJ_DISPATCH: 'mahjong.npmj.dispatch',
    MAHJONG_NPMJ_STATE_PUSH: 'mahjong.npmj.state_push',
    MAHJONG_NTCP_DISPATCH: 'mahjong.ntcp.dispatch',
    MAHJONG_NTCP_STATE_PUSH: 'mahjong.ntcp.state_push',
    MAHJONG_NXKWMJ_DISPATCH: 'mahjong.nxkwmj.dispatch',
    MAHJONG_NXKWMJ_STATE_PUSH: 'mahjong.nxkwmj.state_push',
    MAHJONG_NXMJ_DISPATCH: 'mahjong.nxmj.dispatch',
    MAHJONG_NXMJ_STATE_PUSH: 'mahjong.nxmj.state_push',
    MAHJONG_NYKWXMJ_DISPATCH: 'mahjong.nykwxmj.dispatch',
    MAHJONG_NYKWXMJ_STATE_PUSH: 'mahjong.nykwxmj.state_push',
    MAHJONG_NYTHMJ_DISPATCH: 'mahjong.nythmj.dispatch',
    MAHJONG_NYTHMJ_STATE_PUSH: 'mahjong.nythmj.state_push',
    MAHJONG_NYXXMJ_DISPATCH: 'mahjong.nyxxmj.dispatch',
    MAHJONG_NYXXMJ_STATE_PUSH: 'mahjong.nyxxmj.state_push',
    MAHJONG_NZMJ_DISPATCH: 'mahjong.nzmj.dispatch',
    MAHJONG_NZMJ_STATE_PUSH: 'mahjong.nzmj.state_push',
    MAHJONG_PBYHMJ_DISPATCH: 'mahjong.pbyhmj.dispatch',
    MAHJONG_PBYHMJ_STATE_PUSH: 'mahjong.pbyhmj.state_push',
    MAHJONG_PCMJ_DISPATCH: 'mahjong.pcmj.dispatch',
    MAHJONG_PCMJ_STATE_PUSH: 'mahjong.pcmj.state_push',
    MAHJONG_PDSJXMJ_DISPATCH: 'mahjong.pdsjxmj.dispatch',
    MAHJONG_PDSJXMJ_STATE_PUSH: 'mahjong.pdsjxmj.state_push',
    MAHJONG_PDSLSMJ_DISPATCH: 'mahjong.pdslsmj.dispatch',
    MAHJONG_PDSLSMJ_STATE_PUSH: 'mahjong.pdslsmj.state_push',
    MAHJONG_PDSYXMJ_DISPATCH: 'mahjong.pdsyxmj.dispatch',
    MAHJONG_PDSYXMJ_STATE_PUSH: 'mahjong.pdsyxmj.state_push',
    MAHJONG_PHMJ_DISPATCH: 'mahjong.phmj.dispatch',
    MAHJONG_PHMJ_STATE_PUSH: 'mahjong.phmj.state_push',
    MAHJONG_PNYHMJ_DISPATCH: 'mahjong.pnyhmj.dispatch',
    MAHJONG_PNYHMJ_STATE_PUSH: 'mahjong.pnyhmj.state_push',
    MAHJONG_PT13MJ_DISPATCH: 'mahjong.pt13mj.dispatch',
    MAHJONG_PT13MJ_STATE_PUSH: 'mahjong.pt13mj.state_push',
    MAHJONG_PTMJ_DISPATCH: 'mahjong.ptmj.dispatch',
    MAHJONG_PTMJ_STATE_PUSH: 'mahjong.ptmj.state_push',
    MAHJONG_PX258MJ_DISPATCH: 'mahjong.px258mj.dispatch',
    MAHJONG_PX258MJ_STATE_PUSH: 'mahjong.px258mj.state_push',
    MAHJONG_PXMJ_DISPATCH: 'mahjong.pxmj.dispatch',
    MAHJONG_PXMJ_STATE_PUSH: 'mahjong.pxmj.state_push',
    MAHJONG_PXZZMJ_DISPATCH: 'mahjong.pxzzmj.dispatch',
    MAHJONG_PXZZMJ_STATE_PUSH: 'mahjong.pxzzmj.state_push',
    MAHJONG_PYMJ_DISPATCH: 'mahjong.pymj.dispatch',
    MAHJONG_PYMJ_STATE_PUSH: 'mahjong.pymj.state_push',
    MAHJONG_PZMJ_DISPATCH: 'mahjong.pzmj.dispatch',
    MAHJONG_PZMJ_STATE_PUSH: 'mahjong.pzmj.state_push',
    MAHJONG_QDMJ_DISPATCH: 'mahjong.qdmj.dispatch',
    MAHJONG_QDMJ_STATE_PUSH: 'mahjong.qdmj.state_push',
    MAHJONG_QJFBBMJ_DISPATCH: 'mahjong.qjfbbmj.dispatch',
    MAHJONG_QJFBBMJ_STATE_PUSH: 'mahjong.qjfbbmj.state_push',
    MAHJONG_QJFXJMJ_DISPATCH: 'mahjong.qjfxjmj.dispatch',
    MAHJONG_QJFXJMJ_STATE_PUSH: 'mahjong.qjfxjmj.state_push',
    MAHJONG_QXWQ_DISPATCH: 'mahjong.qxwq.dispatch',
    MAHJONG_QXWQ_STATE_PUSH: 'mahjong.qxwq.state_push',
    MAHJONG_QYMJ_DISPATCH: 'mahjong.qymj.dispatch',
    MAHJONG_QYMJ_STATE_PUSH: 'mahjong.qymj.state_push',
    MAHJONG_QYPHMJ_DISPATCH: 'mahjong.qyphmj.dispatch',
    MAHJONG_QYPHMJ_STATE_PUSH: 'mahjong.qyphmj.state_push',
    MAHJONG_QZCSMJ_DISPATCH: 'mahjong.qzcsmj.dispatch',
    MAHJONG_QZCSMJ_STATE_PUSH: 'mahjong.qzcsmj.state_push',
    MAHJONG_QZKHMJ_DISPATCH: 'mahjong.qzkhmj.dispatch',
    MAHJONG_QZKHMJ_STATE_PUSH: 'mahjong.qzkhmj.state_push',
    MAHJONG_QZMJ_DISPATCH: 'mahjong.qzmj.dispatch',
    MAHJONG_QZMJ_STATE_PUSH: 'mahjong.qzmj.state_push',
    MAHJONG_RBMJ_DISPATCH: 'mahjong.rbmj.dispatch',
    MAHJONG_RBMJ_STATE_PUSH: 'mahjong.rbmj.state_push',
    MAHJONG_RCMJ_DISPATCH: 'mahjong.rcmj.dispatch',
    MAHJONG_RCMJ_STATE_PUSH: 'mahjong.rcmj.state_push',
    MAHJONG_RGJAMJ_DISPATCH: 'mahjong.rgjamj.dispatch',
    MAHJONG_RGJAMJ_STATE_PUSH: 'mahjong.rgjamj.state_push',
    MAHJONG_RJMJ_DISPATCH: 'mahjong.rjmj.dispatch',
    MAHJONG_RJMJ_STATE_PUSH: 'mahjong.rjmj.state_push',
    MAHJONG_RQMJ_DISPATCH: 'mahjong.rqmj.dispatch',
    MAHJONG_RQMJ_STATE_PUSH: 'mahjong.rqmj.state_push',
    MAHJONG_RXEW_DISPATCH: 'mahjong.rxew.dispatch',
    MAHJONG_RXEW_STATE_PUSH: 'mahjong.rxew.state_push',
    MAHJONG_RZMJ_DISPATCH: 'mahjong.rzmj.dispatch',
    MAHJONG_RZMJ_STATE_PUSH: 'mahjong.rzmj.state_push',
    MAHJONG_SCDYMJ_DISPATCH: 'mahjong.scdymj.dispatch',
    MAHJONG_SCDYMJ_STATE_PUSH: 'mahjong.scdymj.state_push',
    MAHJONG_SCGAMJ_DISPATCH: 'mahjong.scgamj.dispatch',
    MAHJONG_SCGAMJ_STATE_PUSH: 'mahjong.scgamj.state_push',
    MAHJONG_SCGXMJ_DISPATCH: 'mahjong.scgxmj.dispatch',
    MAHJONG_SCGXMJ_STATE_PUSH: 'mahjong.scgxmj.state_push',
    MAHJONG_SCMJ_DISPATCH: 'mahjong.scmj.dispatch',
    MAHJONG_SCMJ_STATE_PUSH: 'mahjong.scmj.state_push',
    MAHJONG_SCNJMJ_DISPATCH: 'mahjong.scnjmj.dispatch',
    MAHJONG_SCNJMJ_STATE_PUSH: 'mahjong.scnjmj.state_push',
    MAHJONG_SDFJMJ_DISPATCH: 'mahjong.sdfjmj.dispatch',
    MAHJONG_SDFJMJ_STATE_PUSH: 'mahjong.sdfjmj.state_push',
    MAHJONG_SDHZMJ_DISPATCH: 'mahjong.sdhzmj.dispatch',
    MAHJONG_SDHZMJ_STATE_PUSH: 'mahjong.sdhzmj.state_push',
    MAHJONG_SDJNMJ_DISPATCH: 'mahjong.sdjnmj.dispatch',
    MAHJONG_SDJNMJ_STATE_PUSH: 'mahjong.sdjnmj.state_push',
    MAHJONG_SDLCMJ_DISPATCH: 'mahjong.sdlcmj.dispatch',
    MAHJONG_SDLCMJ_STATE_PUSH: 'mahjong.sdlcmj.state_push',
    MAHJONG_SDLYMJ_DISPATCH: 'mahjong.sdlymj.dispatch',
    MAHJONG_SDLYMJ_STATE_PUSH: 'mahjong.sdlymj.state_push',
    MAHJONG_SDZZMJ_DISPATCH: 'mahjong.sdzzmj.dispatch',
    MAHJONG_SDZZMJ_STATE_PUSH: 'mahjong.sdzzmj.state_push',
    MAHJONG_SFPHMJ_DISPATCH: 'mahjong.sfphmj.dispatch',
    MAHJONG_SFPHMJ_STATE_PUSH: 'mahjong.sfphmj.state_push',
    MAHJONG_SGEW_DISPATCH: 'mahjong.sgew.dispatch',
    MAHJONG_SGEW_STATE_PUSH: 'mahjong.sgew.state_push',
    MAHJONG_SGMJ_DISPATCH: 'mahjong.sgmj.dispatch',
    MAHJONG_SGMJ_STATE_PUSH: 'mahjong.sgmj.state_push',
    MAHJONG_SHQMMJ_DISPATCH: 'mahjong.shqmmj.dispatch',
    MAHJONG_SHQMMJ_STATE_PUSH: 'mahjong.shqmmj.state_push',
    MAHJONG_SMMJ_DISPATCH: 'mahjong.smmj.dispatch',
    MAHJONG_SMMJ_STATE_PUSH: 'mahjong.smmj.state_push',
    MAHJONG_SQMJ_DISPATCH: 'mahjong.sqmj.dispatch',
    MAHJONG_SQMJ_STATE_PUSH: 'mahjong.sqmj.state_push',
    MAHJONG_SQSYMJ_DISPATCH: 'mahjong.sqsymj.dispatch',
    MAHJONG_SQSYMJ_STATE_PUSH: 'mahjong.sqsymj.state_push',
    MAHJONG_SQYCMJ_DISPATCH: 'mahjong.sqycmj.dispatch',
    MAHJONG_SQYCMJ_STATE_PUSH: 'mahjong.sqycmj.state_push',
    MAHJONG_SRMJ_DISPATCH: 'mahjong.srmj.dispatch',
    MAHJONG_SRMJ_STATE_PUSH: 'mahjong.srmj.state_push',
    MAHJONG_SSE_DISPATCH: 'mahjong.sse.dispatch',
    MAHJONG_SSE_STATE_PUSH: 'mahjong.sse.state_push',
    MAHJONG_SSMJ_DISPATCH: 'mahjong.ssmj.dispatch',
    MAHJONG_SSMJ_STATE_PUSH: 'mahjong.ssmj.state_push',
    MAHJONG_SSPMJ_DISPATCH: 'mahjong.sspmj.dispatch',
    MAHJONG_SSPMJ_STATE_PUSH: 'mahjong.sspmj.state_push',
    MAHJONG_STMJ_DISPATCH: 'mahjong.stmj.dispatch',
    MAHJONG_STMJ_STATE_PUSH: 'mahjong.stmj.state_push',
    MAHJONG_STSTMJ_DISPATCH: 'mahjong.ststmj.dispatch',
    MAHJONG_STSTMJ_STATE_PUSH: 'mahjong.ststmj.state_push',
    MAHJONG_SWMJ_DISPATCH: 'mahjong.swmj.dispatch',
    MAHJONG_SWMJ_STATE_PUSH: 'mahjong.swmj.state_push',
    MAHJONG_SXHTMJ_DISPATCH: 'mahjong.sxhtmj.dispatch',
    MAHJONG_SXHTMJ_STATE_PUSH: 'mahjong.sxhtmj.state_push',
    MAHJONG_SXLSMJ_DISPATCH: 'mahjong.sxlsmj.dispatch',
    MAHJONG_SXLSMJ_STATE_PUSH: 'mahjong.sxlsmj.state_push',
    MAHJONG_SXMJ_DISPATCH: 'mahjong.sxmj.dispatch',
    MAHJONG_SXMJ_STATE_PUSH: 'mahjong.sxmj.state_push',
    MAHJONG_SXMMJ_DISPATCH: 'mahjong.sxmmj.dispatch',
    MAHJONG_SXMMJ_STATE_PUSH: 'mahjong.sxmmj.state_push',
    MAHJONG_SXZJMJ_DISPATCH: 'mahjong.sxzjmj.dispatch',
    MAHJONG_SXZJMJ_STATE_PUSH: 'mahjong.sxzjmj.state_push',
    MAHJONG_SYMJ_DISPATCH: 'mahjong.symj.dispatch',
    MAHJONG_SYMJ_STATE_PUSH: 'mahjong.symj.state_push',
    MAHJONG_SYSYBP_DISPATCH: 'mahjong.sysybp.dispatch',
    MAHJONG_SYSYBP_STATE_PUSH: 'mahjong.sysybp.state_push',
    MAHJONG_SZMJ_DISPATCH: 'mahjong.szmj.dispatch',
    MAHJONG_SZMJ_STATE_PUSH: 'mahjong.szmj.state_push',
    MAHJONG_TAMJ_DISPATCH: 'mahjong.tamj.dispatch',
    MAHJONG_TAMJ_STATE_PUSH: 'mahjong.tamj.state_push',
    MAHJONG_TBHMJ_DISPATCH: 'mahjong.tbhmj.dispatch',
    MAHJONG_TBHMJ_STATE_PUSH: 'mahjong.tbhmj.state_push',
    MAHJONG_TBZFBMJ_DISPATCH: 'mahjong.tbzfbmj.dispatch',
    MAHJONG_TBZFBMJ_STATE_PUSH: 'mahjong.tbzfbmj.state_push',
    MAHJONG_TCMJ_DISPATCH: 'mahjong.tcmj.dispatch',
    MAHJONG_TCMJ_STATE_PUSH: 'mahjong.tcmj.state_push',
    MAHJONG_TDHMJ_DISPATCH: 'mahjong.tdhmj.dispatch',
    MAHJONG_TDHMJ_STATE_PUSH: 'mahjong.tdhmj.state_push',
    MAHJONG_TGMJ_DISPATCH: 'mahjong.tgmj.dispatch',
    MAHJONG_TGMJ_STATE_PUSH: 'mahjong.tgmj.state_push',
    MAHJONG_THGJMJ_DISPATCH: 'mahjong.thgjmj.dispatch',
    MAHJONG_THGJMJ_STATE_PUSH: 'mahjong.thgjmj.state_push',
    MAHJONG_TJMJ_DISPATCH: 'mahjong.tjmj.dispatch',
    MAHJONG_TJMJ_STATE_PUSH: 'mahjong.tjmj.state_push',
    MAHJONG_TJTGMJ_DISPATCH: 'mahjong.tjtgmj.dispatch',
    MAHJONG_TJTGMJ_STATE_PUSH: 'mahjong.tjtgmj.state_push',
    MAHJONG_TJTJMJ_DISPATCH: 'mahjong.tjtjmj.dispatch',
    MAHJONG_TJTJMJ_STATE_PUSH: 'mahjong.tjtjmj.state_push',
    MAHJONG_TMHHMJ_DISPATCH: 'mahjong.tmhhmj.dispatch',
    MAHJONG_TMHHMJ_STATE_PUSH: 'mahjong.tmhhmj.state_push',
    MAHJONG_TWMJ_DISPATCH: 'mahjong.twmj.dispatch',
    MAHJONG_TWMJ_STATE_PUSH: 'mahjong.twmj.state_push',
    MAHJONG_TXMJ_DISPATCH: 'mahjong.txmj.dispatch',
    MAHJONG_TXMJ_STATE_PUSH: 'mahjong.txmj.state_push',
    MAHJONG_TZJJMJ_DISPATCH: 'mahjong.tzjjmj.dispatch',
    MAHJONG_TZJJMJ_STATE_PUSH: 'mahjong.tzjjmj.state_push',
    MAHJONG_TZKZMJ_DISPATCH: 'mahjong.tzkzmj.dispatch',
    MAHJONG_TZKZMJ_STATE_PUSH: 'mahjong.tzkzmj.state_push',
    MAHJONG_TZMJ_DISPATCH: 'mahjong.tzmj.dispatch',
    MAHJONG_TZMJ_STATE_PUSH: 'mahjong.tzmj.state_push',
    MAHJONG_WABJMJ_DISPATCH: 'mahjong.wabjmj.dispatch',
    MAHJONG_WABJMJ_STATE_PUSH: 'mahjong.wabjmj.state_push',
    MAHJONG_WGFHMJ_DISPATCH: 'mahjong.wgfhmj.dispatch',
    MAHJONG_WGFHMJ_STATE_PUSH: 'mahjong.wgfhmj.state_push',
    MAHJONG_WHMJ_DISPATCH: 'mahjong.whmj.dispatch',
    MAHJONG_WHMJ_STATE_PUSH: 'mahjong.whmj.state_push',
    MAHJONG_WJMJ_DISPATCH: 'mahjong.wjmj.dispatch',
    MAHJONG_WJMJ_STATE_PUSH: 'mahjong.wjmj.state_push',
    MAHJONG_WNMJ_DISPATCH: 'mahjong.wnmj.dispatch',
    MAHJONG_WNMJ_STATE_PUSH: 'mahjong.wnmj.state_push',
    MAHJONG_WNYH_DISPATCH: 'mahjong.wnyh.dispatch',
    MAHJONG_WNYH_STATE_PUSH: 'mahjong.wnyh.state_push',
    MAHJONG_WXMJ_DISPATCH: 'mahjong.wxmj.dispatch',
    MAHJONG_WXMJ_STATE_PUSH: 'mahjong.wxmj.state_push',
    MAHJONG_WXZMMJ_DISPATCH: 'mahjong.wxzmmj.dispatch',
    MAHJONG_WXZMMJ_STATE_PUSH: 'mahjong.wxzmmj.state_push',
    MAHJONG_WZMJ_DISPATCH: 'mahjong.wzmj.dispatch',
    MAHJONG_WZMJ_STATE_PUSH: 'mahjong.wzmj.state_push',
    MAHJONG_WZQSMJ_DISPATCH: 'mahjong.wzqsmj.dispatch',
    MAHJONG_WZQSMJ_STATE_PUSH: 'mahjong.wzqsmj.state_push',
    MAHJONG_XCMJ_DISPATCH: 'mahjong.xcmj.dispatch',
    MAHJONG_XCMJ_STATE_PUSH: 'mahjong.xcmj.state_push',
    MAHJONG_XFGZMJ_DISPATCH: 'mahjong.xfgzmj.dispatch',
    MAHJONG_XFGZMJ_STATE_PUSH: 'mahjong.xfgzmj.state_push',
    MAHJONG_XGKWXMJ_DISPATCH: 'mahjong.xgkwxmj.dispatch',
    MAHJONG_XGKWXMJ_STATE_PUSH: 'mahjong.xgkwxmj.state_push',
    MAHJONG_XHBBMJ_DISPATCH: 'mahjong.xhbbmj.dispatch',
    MAHJONG_XHBBMJ_STATE_PUSH: 'mahjong.xhbbmj.state_push',
    MAHJONG_XHMJ_DISPATCH: 'mahjong.xhmj.dispatch',
    MAHJONG_XHMJ_STATE_PUSH: 'mahjong.xhmj.state_push',
    MAHJONG_XHZMJ_DISPATCH: 'mahjong.xhzmj.dispatch',
    MAHJONG_XHZMJ_STATE_PUSH: 'mahjong.xhzmj.state_push',
    MAHJONG_XJBJMJ_DISPATCH: 'mahjong.xjbjmj.dispatch',
    MAHJONG_XJBJMJ_STATE_PUSH: 'mahjong.xjbjmj.state_push',
    MAHJONG_XJLSHMJ_DISPATCH: 'mahjong.xjlshmj.dispatch',
    MAHJONG_XJLSHMJ_STATE_PUSH: 'mahjong.xjlshmj.state_push',
    MAHJONG_XJMJ_DISPATCH: 'mahjong.xjmj.dispatch',
    MAHJONG_XJMJ_STATE_PUSH: 'mahjong.xjmj.state_push',
    MAHJONG_XJXZMJ_DISPATCH: 'mahjong.xjxzmj.dispatch',
    MAHJONG_XJXZMJ_STATE_PUSH: 'mahjong.xjxzmj.state_push',
    MAHJONG_XL2VS2MJ_DISPATCH: 'mahjong.xl2vs2mj.dispatch',
    MAHJONG_XL2VS2MJ_STATE_PUSH: 'mahjong.xl2vs2mj.state_push',
    MAHJONG_XLHZMJ_DISPATCH: 'mahjong.xlhzmj.dispatch',
    MAHJONG_XLHZMJ_STATE_PUSH: 'mahjong.xlhzmj.state_push',
    MAHJONG_XLQMJ_DISPATCH: 'mahjong.xlqmj.dispatch',
    MAHJONG_XLQMJ_STATE_PUSH: 'mahjong.xlqmj.state_push',
    MAHJONG_XMMJ_DISPATCH: 'mahjong.xmmj.dispatch',
    MAHJONG_XMMJ_STATE_PUSH: 'mahjong.xmmj.state_push',
    MAHJONG_XNMJ_DISPATCH: 'mahjong.xnmj.dispatch',
    MAHJONG_XNMJ_STATE_PUSH: 'mahjong.xnmj.state_push',
    MAHJONG_XPLP_DISPATCH: 'mahjong.xplp.dispatch',
    MAHJONG_XPLP_STATE_PUSH: 'mahjong.xplp.state_push',
    MAHJONG_XSMJ_DISPATCH: 'mahjong.xsmj.dispatch',
    MAHJONG_XSMJ_STATE_PUSH: 'mahjong.xsmj.state_push',
    MAHJONG_XTLHMJ_DISPATCH: 'mahjong.xtlhmj.dispatch',
    MAHJONG_XTLHMJ_STATE_PUSH: 'mahjong.xtlhmj.state_push',
    MAHJONG_XTMJ_DISPATCH: 'mahjong.xtmj.dispatch',
    MAHJONG_XTMJ_STATE_PUSH: 'mahjong.xtmj.state_push',
    MAHJONG_XUEZHAN_DISPATCH: 'mahjong.xuezhan.dispatch',
    MAHJONG_XUEZHAN_STATE_PUSH: 'mahjong.xuezhan.state_push',
    MAHJONG_XWMJ_DISPATCH: 'mahjong.xwmj.dispatch',
    MAHJONG_XWMJ_STATE_PUSH: 'mahjong.xwmj.state_push',
    MAHJONG_XXFQMJ_DISPATCH: 'mahjong.xxfqmj.dispatch',
    MAHJONG_XXFQMJ_STATE_PUSH: 'mahjong.xxfqmj.state_push',
    MAHJONG_XXMJ_DISPATCH: 'mahjong.xxmj.dispatch',
    MAHJONG_XXMJ_STATE_PUSH: 'mahjong.xxmj.state_push',
    MAHJONG_XXTDHMJ_DISPATCH: 'mahjong.xxtdhmj.dispatch',
    MAHJONG_XXTDHMJ_STATE_PUSH: 'mahjong.xxtdhmj.state_push',
    MAHJONG_XYGSMJ_DISPATCH: 'mahjong.xygsmj.dispatch',
    MAHJONG_XYGSMJ_STATE_PUSH: 'mahjong.xygsmj.state_push',
    MAHJONG_XYHCMJ_DISPATCH: 'mahjong.xyhcmj.dispatch',
    MAHJONG_XYHCMJ_STATE_PUSH: 'mahjong.xyhcmj.state_push',
    MAHJONG_XYMJ_DISPATCH: 'mahjong.xymj.dispatch',
    MAHJONG_XYMJ_STATE_PUSH: 'mahjong.xymj.state_push',
    MAHJONG_XYSCMJ_DISPATCH: 'mahjong.xyscmj.dispatch',
    MAHJONG_XYSCMJ_STATE_PUSH: 'mahjong.xyscmj.state_push',
    MAHJONG_XYXMJ_DISPATCH: 'mahjong.xyxmj.dispatch',
    MAHJONG_XYXMJ_STATE_PUSH: 'mahjong.xyxmj.state_push',
    MAHJONG_XYXXMJ_DISPATCH: 'mahjong.xyxxmj.dispatch',
    MAHJONG_XYXXMJ_STATE_PUSH: 'mahjong.xyxxmj.state_push',
    MAHJONG_XZMJ_DISPATCH: 'mahjong.xzmj.dispatch',
    MAHJONG_XZMJ_STATE_PUSH: 'mahjong.xzmj.state_push',
    MAHJONG_YBGXMJ_DISPATCH: 'mahjong.ybgxmj.dispatch',
    MAHJONG_YBGXMJ_STATE_PUSH: 'mahjong.ybgxmj.state_push',
    MAHJONG_YCFXMJ_DISPATCH: 'mahjong.ycfxmj.dispatch',
    MAHJONG_YCFXMJ_STATE_PUSH: 'mahjong.ycfxmj.state_push',
    MAHJONG_YCMJ_DISPATCH: 'mahjong.ycmj.dispatch',
    MAHJONG_YCMJ_STATE_PUSH: 'mahjong.ycmj.state_push',
    MAHJONG_YCSGMJ_DISPATCH: 'mahjong.ycsgmj.dispatch',
    MAHJONG_YCSGMJ_STATE_PUSH: 'mahjong.ycsgmj.state_push',
    MAHJONG_YCTJMJ_DISPATCH: 'mahjong.yctjmj.dispatch',
    MAHJONG_YCTJMJ_STATE_PUSH: 'mahjong.yctjmj.state_push',
    MAHJONG_YDDGMJ_DISPATCH: 'mahjong.yddgmj.dispatch',
    MAHJONG_YDDGMJ_STATE_PUSH: 'mahjong.yddgmj.state_push',
    MAHJONG_YFCGMJ_DISPATCH: 'mahjong.yfcgmj.dispatch',
    MAHJONG_YFCGMJ_STATE_PUSH: 'mahjong.yfcgmj.state_push',
    MAHJONG_YFMJ_DISPATCH: 'mahjong.yfmj.dispatch',
    MAHJONG_YFMJ_STATE_PUSH: 'mahjong.yfmj.state_push',
    MAHJONG_YGJZMJ_DISPATCH: 'mahjong.ygjzmj.dispatch',
    MAHJONG_YGJZMJ_STATE_PUSH: 'mahjong.ygjzmj.state_push',
    MAHJONG_YGMJ_DISPATCH: 'mahjong.ygmj.dispatch',
    MAHJONG_YGMJ_STATE_PUSH: 'mahjong.ygmj.state_push',
    MAHJONG_YHMJ_DISPATCH: 'mahjong.yhmj.dispatch',
    MAHJONG_YHMJ_STATE_PUSH: 'mahjong.yhmj.state_push',
    MAHJONG_YHZMJ_DISPATCH: 'mahjong.yhzmj.dispatch',
    MAHJONG_YHZMJ_STATE_PUSH: 'mahjong.yhzmj.state_push',
    MAHJONG_YJLYMJ_DISPATCH: 'mahjong.yjlymj.dispatch',
    MAHJONG_YJLYMJ_STATE_PUSH: 'mahjong.yjlymj.state_push',
    MAHJONG_YJMJ_DISPATCH: 'mahjong.yjmj.dispatch',
    MAHJONG_YJMJ_STATE_PUSH: 'mahjong.yjmj.state_push',
    MAHJONG_YJNXMJ_DISPATCH: 'mahjong.yjnxmj.dispatch',
    MAHJONG_YJNXMJ_STATE_PUSH: 'mahjong.yjnxmj.state_push',
    MAHJONG_YKMJ_DISPATCH: 'mahjong.ykmj.dispatch',
    MAHJONG_YKMJ_STATE_PUSH: 'mahjong.ykmj.state_push',
    MAHJONG_YLDGZMJ_DISPATCH: 'mahjong.yldgzmj.dispatch',
    MAHJONG_YLDGZMJ_STATE_PUSH: 'mahjong.yldgzmj.state_push',
    MAHJONG_YSMJ_DISPATCH: 'mahjong.ysmj.dispatch',
    MAHJONG_YSMJ_STATE_PUSH: 'mahjong.ysmj.state_push',
    MAHJONG_YSZMJ_DISPATCH: 'mahjong.yszmj.dispatch',
    MAHJONG_YSZMJ_STATE_PUSH: 'mahjong.yszmj.state_push',
    MAHJONG_YTMJ_DISPATCH: 'mahjong.ytmj.dispatch',
    MAHJONG_YTMJ_STATE_PUSH: 'mahjong.ytmj.state_push',
    MAHJONG_YTYJMJ_DISPATCH: 'mahjong.ytyjmj.dispatch',
    MAHJONG_YTYJMJ_STATE_PUSH: 'mahjong.ytyjmj.state_push',
    MAHJONG_YXBZMJ_DISPATCH: 'mahjong.yxbzmj.dispatch',
    MAHJONG_YXBZMJ_STATE_PUSH: 'mahjong.yxbzmj.state_push',
    MAHJONG_YXMJ_DISPATCH: 'mahjong.yxmj.dispatch',
    MAHJONG_YXMJ_STATE_PUSH: 'mahjong.yxmj.state_push',
    MAHJONG_YXTDH_DISPATCH: 'mahjong.yxtdh.dispatch',
    MAHJONG_YXTDH_STATE_PUSH: 'mahjong.yxtdh.state_push',
    MAHJONG_YYMJ_DISPATCH: 'mahjong.yymj.dispatch',
    MAHJONG_YYMJ_STATE_PUSH: 'mahjong.yymj.state_push',
    MAHJONG_YZGYMJ_DISPATCH: 'mahjong.yzgymj.dispatch',
    MAHJONG_YZGYMJ_STATE_PUSH: 'mahjong.yzgymj.state_push',
    MAHJONG_YZMJ_DISPATCH: 'mahjong.yzmj.dispatch',
    MAHJONG_YZMJ_STATE_PUSH: 'mahjong.yzmj.state_push',
    MAHJONG_YZYZMJ_DISPATCH: 'mahjong.yzyzmj.dispatch',
    MAHJONG_YZYZMJ_STATE_PUSH: 'mahjong.yzyzmj.state_push',
    MAHJONG_ZA13MJ_DISPATCH: 'mahjong.za13mj.dispatch',
    MAHJONG_ZA13MJ_STATE_PUSH: 'mahjong.za13mj.state_push',
    MAHJONG_ZA16MJ_DISPATCH: 'mahjong.za16mj.dispatch',
    MAHJONG_ZA16MJ_STATE_PUSH: 'mahjong.za16mj.state_push',
    MAHJONG_ZASS_DISPATCH: 'mahjong.zass.dispatch',
    MAHJONG_ZASS_STATE_PUSH: 'mahjong.zass.state_push',
    MAHJONG_ZCMJ_DISPATCH: 'mahjong.zcmj.dispatch',
    MAHJONG_ZCMJ_STATE_PUSH: 'mahjong.zcmj.state_push',
    MAHJONG_ZGMJ_DISPATCH: 'mahjong.zgmj.dispatch',
    MAHJONG_ZGMJ_STATE_PUSH: 'mahjong.zgmj.state_push',
    MAHJONG_ZGQZMJ_DISPATCH: 'mahjong.zgqzmj.dispatch',
    MAHJONG_ZGQZMJ_STATE_PUSH: 'mahjong.zgqzmj.state_push',
    MAHJONG_ZJGMJ_DISPATCH: 'mahjong.zjgmj.dispatch',
    MAHJONG_ZJGMJ_STATE_PUSH: 'mahjong.zjgmj.state_push',
    MAHJONG_ZJHZMJ_DISPATCH: 'mahjong.zjhzmj.dispatch',
    MAHJONG_ZJHZMJ_STATE_PUSH: 'mahjong.zjhzmj.state_push',
    MAHJONG_ZJJHMJ_DISPATCH: 'mahjong.zjjhmj.dispatch',
    MAHJONG_ZJJHMJ_STATE_PUSH: 'mahjong.zjjhmj.state_push',
    MAHJONG_ZJMJ_DISPATCH: 'mahjong.zjmj.dispatch',
    MAHJONG_ZJMJ_STATE_PUSH: 'mahjong.zjmj.state_push',
    MAHJONG_ZJQZMJ_DISPATCH: 'mahjong.zjqzmj.dispatch',
    MAHJONG_ZJQZMJ_STATE_PUSH: 'mahjong.zjqzmj.state_push',
    MAHJONG_ZJSHZMJ_DISPATCH: 'mahjong.zjshzmj.dispatch',
    MAHJONG_ZJSHZMJ_STATE_PUSH: 'mahjong.zjshzmj.state_push',
    MAHJONG_ZJTZMJ_DISPATCH: 'mahjong.zjtzmj.dispatch',
    MAHJONG_ZJTZMJ_STATE_PUSH: 'mahjong.zjtzmj.state_push',
    MAHJONG_ZJWZMJ_DISPATCH: 'mahjong.zjwzmj.dispatch',
    MAHJONG_ZJWZMJ_STATE_PUSH: 'mahjong.zjwzmj.state_push',
    MAHJONG_ZKLYMJ_DISPATCH: 'mahjong.zklymj.dispatch',
    MAHJONG_ZKLYMJ_STATE_PUSH: 'mahjong.zklymj.state_push',
    MAHJONG_ZKMJ_DISPATCH: 'mahjong.zkmj.dispatch',
    MAHJONG_ZKMJ_STATE_PUSH: 'mahjong.zkmj.state_push',
    MAHJONG_ZMDMJ_DISPATCH: 'mahjong.zmdmj.dispatch',
    MAHJONG_ZMDMJ_STATE_PUSH: 'mahjong.zmdmj.state_push',
    MAHJONG_ZPMJ_DISPATCH: 'mahjong.zpmj.dispatch',
    MAHJONG_ZPMJ_STATE_PUSH: 'mahjong.zpmj.state_push',
    MAHJONG_ZXMJ_DISPATCH: 'mahjong.zxmj.dispatch',
    MAHJONG_ZXMJ_STATE_PUSH: 'mahjong.zxmj.state_push',
    MAHJONG_ZYMJ_DISPATCH: 'mahjong.zymj.dispatch',
    MAHJONG_ZYMJ_STATE_PUSH: 'mahjong.zymj.state_push',
    MAHJONG_ZZMJ_DISPATCH: 'mahjong.zzmj.dispatch',
    MAHJONG_ZZMJ_STATE_PUSH: 'mahjong.zzmj.state_push',
    MAHJONG_ZZPH_DISPATCH: 'mahjong.zzph.dispatch',
    MAHJONG_ZZPH_STATE_PUSH: 'mahjong.zzph.state_push',
    POKER_ANYUE2005_DISPATCH: 'poker.anyue2005.dispatch',
    POKER_ANYUE2005_STATE_PUSH: 'poker.anyue2005.state_push',
    POKER_BOZHOU2009_DISPATCH: 'poker.bozhou2009.dispatch',
    POKER_BOZHOU2009_STATE_PUSH: 'poker.bozhou2009.state_push',
    POKER_CHENGDU2001_DISPATCH: 'poker.chengdu2001.dispatch',
    POKER_CHENGDU2001_STATE_PUSH: 'poker.chengdu2001.state_push',
    POKER_CHENGDU2999_DISPATCH: 'poker.chengdu2999.dispatch',
    POKER_FUZHOU2028_DISPATCH: 'poker.fuzhou2028.dispatch',
    POKER_FUZHOU2028_STATE_PUSH: 'poker.fuzhou2028.state_push',
    POKER_GAOAN2025_DISPATCH: 'poker.gaoan2025.dispatch',
    POKER_GAOAN2025_STATE_PUSH: 'poker.gaoan2025.state_push',
    POKER_GUSHI2012_DISPATCH: 'poker.gushi2012.dispatch',
    POKER_GUSHI2012_STATE_PUSH: 'poker.gushi2012.state_push',
    POKER_HENAN2019_DISPATCH: 'poker.henan2019.dispatch',
    POKER_HENAN2019_STATE_PUSH: 'poker.henan2019.state_push',
    POKER_HUAIBIN2021_DISPATCH: 'poker.huaibin2021.dispatch',
    POKER_HUAIBIN2021_STATE_PUSH: 'poker.huaibin2021.state_push',
    POKER_HUAIHUA2015_DISPATCH: 'poker.huaihua2015.dispatch',
    POKER_HUAIHUA2015_STATE_PUSH: 'poker.huaihua2015.state_push',
    POKER_HUANGCHUAN2022_DISPATCH: 'poker.huangchuan2022.dispatch',
    POKER_HUANGCHUAN2022_STATE_PUSH: 'poker.huangchuan2022.state_push',
    POKER_JIAN2011_DISPATCH: 'poker.jian2011.dispatch',
    POKER_JIAN2011_STATE_PUSH: 'poker.jian2011.state_push',
    POKER_JIANGSU2018_DISPATCH: 'poker.jiangsu2018.dispatch',
    POKER_JIANGSU2018_STATE_PUSH: 'poker.jiangsu2018.state_push',
    POKER_JINGDEZHEN2017_DISPATCH: 'poker.jingdezhen2017.dispatch',
    POKER_JINGDEZHEN2017_STATE_PUSH: 'poker.jingdezhen2017.state_push',
    POKER_JINTAN2024_DISPATCH: 'poker.jintan2024.dispatch',
    POKER_JINTAN2024_STATE_PUSH: 'poker.jintan2024.state_push',
    POKER_LEPING2008_DISPATCH: 'poker.leping2008.dispatch',
    POKER_LEPING2008_STATE_PUSH: 'poker.leping2008.state_push',
    POKER_LIANGSHAN2003_DISPATCH: 'poker.liangshan2003.dispatch',
    POKER_LIANGSHAN2003_STATE_PUSH: 'poker.liangshan2003.state_push',
    POKER_MIANNING2004_DISPATCH: 'poker.mianning2004.dispatch',
    POKER_MIANNING2004_STATE_PUSH: 'poker.mianning2004.state_push',
    POKER_NEIJIANG2002_DISPATCH: 'poker.neijiang2002.dispatch',
    POKER_NEIJIANG2002_STATE_PUSH: 'poker.neijiang2002.state_push',
    POKER_NINGDU2014_DISPATCH: 'poker.ningdu2014.dispatch',
    POKER_NINGDU2014_STATE_PUSH: 'poker.ningdu2014.state_push',
    POKER_PANZHIHUA2006_DISPATCH: 'poker.panzhihua2006.dispatch',
    POKER_PANZHIHUA2006_STATE_PUSH: 'poker.panzhihua2006.state_push',
    POKER_PDK_DISPATCH: 'poker.pdk.dispatch',
    POKER_PDK_STATE_PUSH: 'poker.pdk.state_push',
    POKER_POYANG2023_DISPATCH: 'poker.poyang2023.dispatch',
    POKER_POYANG2023_STATE_PUSH: 'poker.poyang2023.state_push',
    POKER_QUANGUO2997_DISPATCH: 'poker.quanguo2997.dispatch',
    POKER_QUANGUO2998_DISPATCH: 'poker.quanguo2998.dispatch',
    POKER_TAIZHOU2020_DISPATCH: 'poker.taizhou2020.dispatch',
    POKER_TAIZHOU2020_STATE_PUSH: 'poker.taizhou2020.state_push',
    POKER_WANNIAN2007_DISPATCH: 'poker.wannian2007.dispatch',
    POKER_WANNIAN2007_STATE_PUSH: 'poker.wannian2007.state_push',
    POKER_XIAOGAN2013_DISPATCH: 'poker.xiaogan2013.dispatch',
    POKER_XIAOGAN2013_STATE_PUSH: 'poker.xiaogan2013.state_push',
    POKER_XINXIAN2016_DISPATCH: 'poker.xinxian2016.dispatch',
    POKER_XINXIAN2016_STATE_PUSH: 'poker.xinxian2016.state_push',
    POKER_XUANCHENG2027_DISPATCH: 'poker.xuancheng2027.dispatch',
    POKER_XUANCHENG2027_STATE_PUSH: 'poker.xuancheng2027.state_push',
    POKER_YIXING2026_DISPATCH: 'poker.yixing2026.dispatch',
    POKER_YIXING2026_STATE_PUSH: 'poker.yixing2026.state_push',
    POKER_YUGAN2010_DISPATCH: 'poker.yugan2010.dispatch',
    POKER_YUGAN2010_STATE_PUSH: 'poker.yugan2010.state_push',
    REPLAY_PERSPECTIVE_PAGE: 'replay.perspective_page',
    REPLAY_QUERY: 'replay.query',
    ROOM_CREATE: 'room.create',
    ROOM_DISSOLVE_APPLY: 'room.dissolve_apply',
    ROOM_DISSOLVE_VOTE: 'room.dissolve_vote',
    ROOM_HANDOFF: 'room.handoff',
    ROOM_JOIN: 'room.join',
    ROOM_LEAVE: 'room.leave',
    ROOM_RECONNECT: 'room.reconnect',
    ROOM_SEAT: 'room.seat',
    SYSTEM_HEARTBEAT: 'system.heartbeat',
    SYSTEM_KICK_OUT: 'system.kick_out',
} as const;
export type ProtocolId = typeof ProtocolIds[keyof typeof ProtocolIds];
export const ProtocolDefinitions = {
    ...ProtocolDefinitionsChunk000,
    ...ProtocolDefinitionsChunk001,
    ...ProtocolDefinitionsChunk002,
    ...ProtocolDefinitionsChunk003,
    ...ProtocolDefinitionsChunk004,
    ...ProtocolDefinitionsChunk005,
    ...ProtocolDefinitionsChunk006,
    ...ProtocolDefinitionsChunk007,
    ...ProtocolDefinitionsChunk008,
    ...ProtocolDefinitionsChunk009,
    ...ProtocolDefinitionsChunk010,
    ...ProtocolDefinitionsChunk011,
    ...ProtocolDefinitionsChunk012,
    ...ProtocolDefinitionsChunk013,
    ...ProtocolDefinitionsChunk014,
    ...ProtocolDefinitionsChunk015,
    ...ProtocolDefinitionsChunk016,
    ...ProtocolDefinitionsChunk017,
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
    'mahjong.afmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.afmj.state_push': {  };
    'mahjong.ahhbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ahhbmj.state_push': {  };
    'mahjong.ahhnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ahhnmj.state_push': {  };
    'mahjong.ahmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ahmj.state_push': {  };
    'mahjong.ak159mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ak159mj.state_push': {  };
    'mahjong.aqmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.aqmj.state_push': {  };
    'mahjong.asmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.asmj.state_push': {  };
    'mahjong.aymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.aymj.state_push': {  };
    'mahjong.bamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bamj.state_push': {  };
    'mahjong.bdjhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bdjhmj.state_push': {  };
    'mahjong.bdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bdmj.state_push': {  };
    'mahjong.bdyxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bdyxmj.state_push': {  };
    'mahjong.bfmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bfmj.state_push': {  };
    'mahjong.bsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bsmj.state_push': {  };
    'mahjong.bzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bzmj.state_push': {  };
    'mahjong.bzqzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bzqzmj.state_push': {  };
    'mahjong.bztdh.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bztdh.state_push': {  };
    'mahjong.caooszmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.caooszmj.state_push': {  };
    'mahjong.ccmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ccmj.state_push': {  };
    'mahjong.chengdu1001.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.chengdu1001.state_push': {  };
    'mahjong.chmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.chmj.state_push': {  };
    'mahjong.cnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cnmj.state_push': {  };
    'mahjong.csmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.csmj.state_push': {  };
    'mahjong.cxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cxmj.state_push': {  };
    'mahjong.cxyxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cxyxmj.state_push': {  };
    'mahjong.cylymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cylymj.state_push': {  };
    'mahjong.czczmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.czczmj.state_push': {  };
    'mahjong.czdzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.czdzmj.state_push': {  };
    'mahjong.czmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.czmj.state_push': {  };
    'mahjong.dcwdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dcwdmj.state_push': {  };
    'mahjong.dczbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dczbmj.state_push': {  };
    'mahjong.demomj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.demomj.state_push': {  };
    'mahjong.dkgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dkgmj.state_push': {  };
    'mahjong.dlaoomj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dlaoomj.state_push': {  };
    'mahjong.dnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dnmj.state_push': {  };
    'mahjong.dphmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dphmj.state_push': {  };
    'mahjong.dsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dsmj.state_push': {  };
    'mahjong.dtlgfmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dtlgfmj.state_push': {  };
    'mahjong.dtmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dtmj.state_push': {  };
    'mahjong.dxbjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dxbjmj.state_push': {  };
    'mahjong.dymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dymj.state_push': {  };
    'mahjong.dzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dzmj.state_push': {  };
    'mahjong.dzsjzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dzsjzmj.state_push': {  };
    'mahjong.fcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fcmj.state_push': {  };
    'mahjong.fctdhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fctdhmj.state_push': {  };
    'mahjong.fdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fdmj.state_push': {  };
    'mahjong.fjyxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fjyxmj.state_push': {  };
    'mahjong.fxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fxmj.state_push': {  };
    'mahjong.fyddzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fyddzmj.state_push': {  };
    'mahjong.fymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fymj.state_push': {  };
    'mahjong.fzgcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fzgcmj.state_push': {  };
    'mahjong.fzjxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fzjxmj.state_push': {  };
    'mahjong.fzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fzmj.state_push': {  };
    'mahjong.gamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gamj.state_push': {  };
    'mahjong.gcbgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gcbgmj.state_push': {  };
    'mahjong.gcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gcmj.state_push': {  };
    'mahjong.gdczmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gdczmj.state_push': {  };
    'mahjong.gdjymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gdjymj.state_push': {  };
    'mahjong.gdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gdmj.state_push': {  };
    'mahjong.gft258mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gft258mj.state_push': {  };
    'mahjong.gjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gjmj.state_push': {  };
    'mahjong.glqzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.glqzmj.state_push': {  };
    'mahjong.gnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gnmj.state_push': {  };
    'mahjong.gsjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gsjmj.state_push': {  };
    'mahjong.gslzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gslzmj.state_push': {  };
    'mahjong.gsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gsmj.state_push': {  };
    'mahjong.gxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gxmj.state_push': {  };
    'mahjong.gymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gymj.state_push': {  };
    'mahjong.gyzjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gyzjmj.state_push': {  };
    'mahjong.gzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gzmj.state_push': {  };
    'mahjong.hamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hamj.state_push': {  };
    'mahjong.haxymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.haxymj.state_push': {  };
    'mahjong.hbhbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbhbmj.state_push': {  };
    'mahjong.hbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbmj.state_push': {  };
    'mahjong.hbtdhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbtdhmj.state_push': {  };
    'mahjong.hbwhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbwhmj.state_push': {  };
    'mahjong.hbyxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbyxmj.state_push': {  };
    'mahjong.hebmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hebmj.state_push': {  };
    'mahjong.hfbzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hfbzmj.state_push': {  };
    'mahjong.hfmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hfmj.state_push': {  };
    'mahjong.hhhgw.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hhhgw.state_push': {  };
    'mahjong.hjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hjmj.state_push': {  };
    'mahjong.hldmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hldmj.state_push': {  };
    'mahjong.hnaymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnaymj.state_push': {  };
    'mahjong.hncsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hncsmj.state_push': {  };
    'mahjong.hnhbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnhbmj.state_push': {  };
    'mahjong.hnjymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnjymj.state_push': {  };
    'mahjong.hnjzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnjzmj.state_push': {  };
    'mahjong.hnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnmj.state_push': {  };
    'mahjong.hnpdsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnpdsmj.state_push': {  };
    'mahjong.hnsymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnsymj.state_push': {  };
    'mahjong.hnxcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnxcmj.state_push': {  };
    'mahjong.hnxymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnxymj.state_push': {  };
    'mahjong.hnyjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnyjmj.state_push': {  };
    'mahjong.hnzzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnzzmj.state_push': {  };
    'mahjong.hsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hsmj.state_push': {  };
    'mahjong.hstdhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hstdhmj.state_push': {  };
    'mahjong.htmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.htmj.state_push': {  };
    'mahjong.hyhsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hyhsmj.state_push': {  };
    'mahjong.hylymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hylymj.state_push': {  };
    'mahjong.hzbdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzbdmj.state_push': {  };
    'mahjong.hzjdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzjdmj.state_push': {  };
    'mahjong.hzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzmj.state_push': {  };
    'mahjong.hzwmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzwmj.state_push': {  };
    'mahjong.jamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jamj.state_push': {  };
    'mahjong.jayxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jayxmj.state_push': {  };
    'mahjong.jcahmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jcahmj.state_push': {  };
    'mahjong.jchhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jchhmj.state_push': {  };
    'mahjong.jcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jcmj.state_push': {  };
    'mahjong.jdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jdmj.state_push': {  };
    'mahjong.jdzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jdzmj.state_push': {  };
    'mahjong.jjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jjmj.state_push': {  };
    'mahjong.jlmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jlmj.state_push': {  };
    'mahjong.jmgghmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmgghmj.state_push': {  };
    'mahjong.jmhhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmhhmj.state_push': {  };
    'mahjong.jmjsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmjsmj.state_push': {  };
    'mahjong.jmskmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmskmj.state_push': {  };
    'mahjong.jnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jnmj.state_push': {  };
    'mahjong.jsczmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsczmj.state_push': {  };
    'mahjong.jsgymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsgymj.state_push': {  };
    'mahjong.jshamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jshamj.state_push': {  };
    'mahjong.jsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsmj.state_push': {  };
    'mahjong.jsnyzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsnyzmj.state_push': {  };
    'mahjong.jssnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jssnmj.state_push': {  };
    'mahjong.jssqmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jssqmj.state_push': {  };
    'mahjong.jstdhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jstdhmj.state_push': {  };
    'mahjong.jsxymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsxymj.state_push': {  };
    'mahjong.jsycmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsycmj.state_push': {  };
    'mahjong.jsyzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsyzmj.state_push': {  };
    'mahjong.jtmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jtmj.state_push': {  };
    'mahjong.jxfzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxfzmj.state_push': {  };
    'mahjong.jxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxmj.state_push': {  };
    'mahjong.jxndmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxndmj.state_push': {  };
    'mahjong.jxxymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxxymj.state_push': {  };
    'mahjong.jyessz.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jyessz.state_push': {  };
    'mahjong.jymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jymj.state_push': {  };
    'mahjong.jzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jzmj.state_push': {  };
    'mahjong.jzwzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jzwzmj.state_push': {  };
    'mahjong.kfmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.kfmj.state_push': {  };
    'mahjong.klmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.klmj.state_push': {  };
    'mahjong.ksmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ksmj.state_push': {  };
    'mahjong.lamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lamj.state_push': {  };
    'mahjong.lbhzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lbhzmj.state_push': {  };
    'mahjong.lbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lbmj.state_push': {  };
    'mahjong.lcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lcmj.state_push': {  };
    'mahjong.lfphmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lfphmj.state_push': {  };
    'mahjong.lgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lgmj.state_push': {  };
    'mahjong.lhgmmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lhgmmj.state_push': {  };
    'mahjong.lhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lhmj.state_push': {  };
    'mahjong.lkmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lkmj.state_push': {  };
    'mahjong.llfymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.llfymj.state_push': {  };
    'mahjong.lnjzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lnjzmj.state_push': {  };
    'mahjong.lnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lnmj.state_push': {  };
    'mahjong.lnsymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lnsymj.state_push': {  };
    'mahjong.lpmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lpmj.state_push': {  };
    'mahjong.lpsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lpsmj.state_push': {  };
    'mahjong.ls13579.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ls13579.state_push': {  };
    'mahjong.lskjjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lskjjmj.state_push': {  };
    'mahjong.lslwzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lslwzmj.state_push': {  };
    'mahjong.lsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lsmj.state_push': {  };
    'mahjong.lsxzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lsxzmj.state_push': {  };
    'mahjong.lsyjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lsyjmj.state_push': {  };
    'mahjong.lwmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lwmj.state_push': {  };
    'mahjong.lxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lxmj.state_push': {  };
    'mahjong.lygcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lygcmj.state_push': {  };
    'mahjong.lygmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lygmj.state_push': {  };
    'mahjong.lymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lymj.state_push': {  };
    'mahjong.lzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lzmj.state_push': {  };
    'mahjong.lzxzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lzxzmj.state_push': {  };
    'mahjong.masmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.masmj.state_push': {  };
    'mahjong.mmmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.mmmj.state_push': {  };
    'mahjong.msmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.msmj.state_push': {  };
    'mahjong.mymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.mymj.state_push': {  };
    'mahjong.mzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.mzmj.state_push': {  };
    'mahjong.namj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.namj.state_push': {  };
    'mahjong.nbcxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nbcxmj.state_push': {  };
    'mahjong.nbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nbmj.state_push': {  };
    'mahjong.ncaymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ncaymj.state_push': {  };
    'mahjong.ncmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ncmj.state_push': {  };
    'mahjong.ndmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ndmj.state_push': {  };
    'mahjong.nhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nhmj.state_push': {  };
    'mahjong.njlhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.njlhmj.state_push': {  };
    'mahjong.njmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.njmj.state_push': {  };
    'mahjong.nkbhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nkbhmj.state_push': {  };
    'mahjong.nmgyzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nmgyzmj.state_push': {  };
    'mahjong.npgzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.npgzmj.state_push': {  };
    'mahjong.npmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.npmj.state_push': {  };
    'mahjong.ntcp.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ntcp.state_push': {  };
    'mahjong.nxkwmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nxkwmj.state_push': {  };
    'mahjong.nxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nxmj.state_push': {  };
    'mahjong.nykwxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nykwxmj.state_push': {  };
    'mahjong.nythmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nythmj.state_push': {  };
    'mahjong.nyxxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nyxxmj.state_push': {  };
    'mahjong.nzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nzmj.state_push': {  };
    'mahjong.pbyhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pbyhmj.state_push': {  };
    'mahjong.pcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pcmj.state_push': {  };
    'mahjong.pdsjxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pdsjxmj.state_push': {  };
    'mahjong.pdslsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pdslsmj.state_push': {  };
    'mahjong.pdsyxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pdsyxmj.state_push': {  };
    'mahjong.phmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.phmj.state_push': {  };
    'mahjong.pnyhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pnyhmj.state_push': {  };
    'mahjong.pt13mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pt13mj.state_push': {  };
    'mahjong.ptmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ptmj.state_push': {  };
    'mahjong.px258mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.px258mj.state_push': {  };
    'mahjong.pxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pxmj.state_push': {  };
    'mahjong.pxzzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pxzzmj.state_push': {  };
    'mahjong.pymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pymj.state_push': {  };
    'mahjong.pzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pzmj.state_push': {  };
    'mahjong.qdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qdmj.state_push': {  };
    'mahjong.qjfbbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qjfbbmj.state_push': {  };
    'mahjong.qjfxjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qjfxjmj.state_push': {  };
    'mahjong.qxwq.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qxwq.state_push': {  };
    'mahjong.qymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qymj.state_push': {  };
    'mahjong.qyphmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qyphmj.state_push': {  };
    'mahjong.qzcsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qzcsmj.state_push': {  };
    'mahjong.qzkhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qzkhmj.state_push': {  };
    'mahjong.qzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qzmj.state_push': {  };
    'mahjong.rbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rbmj.state_push': {  };
    'mahjong.rcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rcmj.state_push': {  };
    'mahjong.rgjamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rgjamj.state_push': {  };
    'mahjong.rjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rjmj.state_push': {  };
    'mahjong.rqmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rqmj.state_push': {  };
    'mahjong.rxew.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rxew.state_push': {  };
    'mahjong.rzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rzmj.state_push': {  };
    'mahjong.scdymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scdymj.state_push': {  };
    'mahjong.scgamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scgamj.state_push': {  };
    'mahjong.scgxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scgxmj.state_push': {  };
    'mahjong.scmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scmj.state_push': {  };
    'mahjong.scnjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scnjmj.state_push': {  };
    'mahjong.sdfjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdfjmj.state_push': {  };
    'mahjong.sdhzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdhzmj.state_push': {  };
    'mahjong.sdjnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdjnmj.state_push': {  };
    'mahjong.sdlcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdlcmj.state_push': {  };
    'mahjong.sdlymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdlymj.state_push': {  };
    'mahjong.sdzzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdzzmj.state_push': {  };
    'mahjong.sfphmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sfphmj.state_push': {  };
    'mahjong.sgew.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sgew.state_push': {  };
    'mahjong.sgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sgmj.state_push': {  };
    'mahjong.shqmmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.shqmmj.state_push': {  };
    'mahjong.smmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.smmj.state_push': {  };
    'mahjong.sqmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sqmj.state_push': {  };
    'mahjong.sqsymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sqsymj.state_push': {  };
    'mahjong.sqycmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sqycmj.state_push': {  };
    'mahjong.srmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.srmj.state_push': {  };
    'mahjong.sse.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sse.state_push': {  };
    'mahjong.ssmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ssmj.state_push': {  };
    'mahjong.sspmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sspmj.state_push': {  };
    'mahjong.stmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.stmj.state_push': {  };
    'mahjong.ststmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ststmj.state_push': {  };
    'mahjong.swmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.swmj.state_push': {  };
    'mahjong.sxhtmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxhtmj.state_push': {  };
    'mahjong.sxlsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxlsmj.state_push': {  };
    'mahjong.sxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxmj.state_push': {  };
    'mahjong.sxmmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxmmj.state_push': {  };
    'mahjong.sxzjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxzjmj.state_push': {  };
    'mahjong.symj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.symj.state_push': {  };
    'mahjong.sysybp.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sysybp.state_push': {  };
    'mahjong.szmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.szmj.state_push': {  };
    'mahjong.tamj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tamj.state_push': {  };
    'mahjong.tbhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tbhmj.state_push': {  };
    'mahjong.tbzfbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tbzfbmj.state_push': {  };
    'mahjong.tcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tcmj.state_push': {  };
    'mahjong.tdhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tdhmj.state_push': {  };
    'mahjong.tgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tgmj.state_push': {  };
    'mahjong.thgjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.thgjmj.state_push': {  };
    'mahjong.tjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tjmj.state_push': {  };
    'mahjong.tjtgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tjtgmj.state_push': {  };
    'mahjong.tjtjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tjtjmj.state_push': {  };
    'mahjong.tmhhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tmhhmj.state_push': {  };
    'mahjong.twmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.twmj.state_push': {  };
    'mahjong.txmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.txmj.state_push': {  };
    'mahjong.tzjjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tzjjmj.state_push': {  };
    'mahjong.tzkzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tzkzmj.state_push': {  };
    'mahjong.tzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tzmj.state_push': {  };
    'mahjong.wabjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wabjmj.state_push': {  };
    'mahjong.wgfhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wgfhmj.state_push': {  };
    'mahjong.whmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.whmj.state_push': {  };
    'mahjong.wjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wjmj.state_push': {  };
    'mahjong.wnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wnmj.state_push': {  };
    'mahjong.wnyh.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wnyh.state_push': {  };
    'mahjong.wxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wxmj.state_push': {  };
    'mahjong.wxzmmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wxzmmj.state_push': {  };
    'mahjong.wzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wzmj.state_push': {  };
    'mahjong.wzqsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wzqsmj.state_push': {  };
    'mahjong.xcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xcmj.state_push': {  };
    'mahjong.xfgzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xfgzmj.state_push': {  };
    'mahjong.xgkwxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xgkwxmj.state_push': {  };
    'mahjong.xhbbmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xhbbmj.state_push': {  };
    'mahjong.xhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xhmj.state_push': {  };
    'mahjong.xhzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xhzmj.state_push': {  };
    'mahjong.xjbjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjbjmj.state_push': {  };
    'mahjong.xjlshmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjlshmj.state_push': {  };
    'mahjong.xjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjmj.state_push': {  };
    'mahjong.xjxzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjxzmj.state_push': {  };
    'mahjong.xl2vs2mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xl2vs2mj.state_push': {  };
    'mahjong.xlhzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xlhzmj.state_push': {  };
    'mahjong.xlqmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xlqmj.state_push': {  };
    'mahjong.xmmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xmmj.state_push': {  };
    'mahjong.xnmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xnmj.state_push': {  };
    'mahjong.xplp.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xplp.state_push': {  };
    'mahjong.xsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xsmj.state_push': {  };
    'mahjong.xtlhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xtlhmj.state_push': {  };
    'mahjong.xtmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xtmj.state_push': {  };
    'mahjong.xuezhan.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xuezhan.state_push': {  };
    'mahjong.xwmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xwmj.state_push': {  };
    'mahjong.xxfqmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xxfqmj.state_push': {  };
    'mahjong.xxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xxmj.state_push': {  };
    'mahjong.xxtdhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xxtdhmj.state_push': {  };
    'mahjong.xygsmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xygsmj.state_push': {  };
    'mahjong.xyhcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyhcmj.state_push': {  };
    'mahjong.xymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xymj.state_push': {  };
    'mahjong.xyscmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyscmj.state_push': {  };
    'mahjong.xyxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyxmj.state_push': {  };
    'mahjong.xyxxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyxxmj.state_push': {  };
    'mahjong.xzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xzmj.state_push': {  };
    'mahjong.ybgxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ybgxmj.state_push': {  };
    'mahjong.ycfxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ycfxmj.state_push': {  };
    'mahjong.ycmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ycmj.state_push': {  };
    'mahjong.ycsgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ycsgmj.state_push': {  };
    'mahjong.yctjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yctjmj.state_push': {  };
    'mahjong.yddgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yddgmj.state_push': {  };
    'mahjong.yfcgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yfcgmj.state_push': {  };
    'mahjong.yfmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yfmj.state_push': {  };
    'mahjong.ygjzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ygjzmj.state_push': {  };
    'mahjong.ygmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ygmj.state_push': {  };
    'mahjong.yhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yhmj.state_push': {  };
    'mahjong.yhzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yhzmj.state_push': {  };
    'mahjong.yjlymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yjlymj.state_push': {  };
    'mahjong.yjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yjmj.state_push': {  };
    'mahjong.yjnxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yjnxmj.state_push': {  };
    'mahjong.ykmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ykmj.state_push': {  };
    'mahjong.yldgzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yldgzmj.state_push': {  };
    'mahjong.ysmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ysmj.state_push': {  };
    'mahjong.yszmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yszmj.state_push': {  };
    'mahjong.ytmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ytmj.state_push': {  };
    'mahjong.ytyjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ytyjmj.state_push': {  };
    'mahjong.yxbzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yxbzmj.state_push': {  };
    'mahjong.yxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yxmj.state_push': {  };
    'mahjong.yxtdh.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yxtdh.state_push': {  };
    'mahjong.yymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yymj.state_push': {  };
    'mahjong.yzgymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yzgymj.state_push': {  };
    'mahjong.yzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yzmj.state_push': {  };
    'mahjong.yzyzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yzyzmj.state_push': {  };
    'mahjong.za13mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.za13mj.state_push': {  };
    'mahjong.za16mj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.za16mj.state_push': {  };
    'mahjong.zass.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zass.state_push': {  };
    'mahjong.zcmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zcmj.state_push': {  };
    'mahjong.zgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zgmj.state_push': {  };
    'mahjong.zgqzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zgqzmj.state_push': {  };
    'mahjong.zjgmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjgmj.state_push': {  };
    'mahjong.zjhzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjhzmj.state_push': {  };
    'mahjong.zjjhmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjjhmj.state_push': {  };
    'mahjong.zjmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjmj.state_push': {  };
    'mahjong.zjqzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjqzmj.state_push': {  };
    'mahjong.zjshzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjshzmj.state_push': {  };
    'mahjong.zjtzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjtzmj.state_push': {  };
    'mahjong.zjwzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjwzmj.state_push': {  };
    'mahjong.zklymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zklymj.state_push': {  };
    'mahjong.zkmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zkmj.state_push': {  };
    'mahjong.zmdmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zmdmj.state_push': {  };
    'mahjong.zpmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zpmj.state_push': {  };
    'mahjong.zxmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zxmj.state_push': {  };
    'mahjong.zymj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zymj.state_push': {  };
    'mahjong.zzmj.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zzmj.state_push': {  };
    'mahjong.zzph.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zzph.state_push': {  };
    'poker.anyue2005.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.anyue2005.state_push': {  };
    'poker.bozhou2009.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.bozhou2009.state_push': {  };
    'poker.chengdu2001.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.chengdu2001.state_push': {  };
    'poker.chengdu2999.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.fuzhou2028.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.fuzhou2028.state_push': {  };
    'poker.gaoan2025.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.gaoan2025.state_push': {  };
    'poker.gushi2012.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.gushi2012.state_push': {  };
    'poker.henan2019.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.henan2019.state_push': {  };
    'poker.huaibin2021.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.huaibin2021.state_push': {  };
    'poker.huaihua2015.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.huaihua2015.state_push': {  };
    'poker.huangchuan2022.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.huangchuan2022.state_push': {  };
    'poker.jian2011.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.jian2011.state_push': {  };
    'poker.jiangsu2018.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.jiangsu2018.state_push': {  };
    'poker.jingdezhen2017.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.jingdezhen2017.state_push': {  };
    'poker.jintan2024.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.jintan2024.state_push': {  };
    'poker.leping2008.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.leping2008.state_push': {  };
    'poker.liangshan2003.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.liangshan2003.state_push': {  };
    'poker.mianning2004.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.mianning2004.state_push': {  };
    'poker.neijiang2002.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.neijiang2002.state_push': {  };
    'poker.ningdu2014.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.ningdu2014.state_push': {  };
    'poker.panzhihua2006.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.panzhihua2006.state_push': {  };
    'poker.pdk.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.pdk.state_push': {  };
    'poker.poyang2023.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.poyang2023.state_push': {  };
    'poker.quanguo2997.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.quanguo2998.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.taizhou2020.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.taizhou2020.state_push': {  };
    'poker.wannian2007.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.wannian2007.state_push': {  };
    'poker.xiaogan2013.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.xiaogan2013.state_push': {  };
    'poker.xinxian2016.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.xinxian2016.state_push': {  };
    'poker.xuancheng2027.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.xuancheng2027.state_push': {  };
    'poker.yixing2026.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.yixing2026.state_push': {  };
    'poker.yugan2010.dispatch': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.yugan2010.state_push': {  };
    'replay.perspective_page': { "action": string; "payload": Readonly<Record<string, unknown>>; "roomId": string; "setId": number; "afterSequence"?: number; "limit"?: number };
    'replay.query': { "roomId": string };
    'room.create': { "gameId": string; "roomProfileVersion": string; "ruleSnapshotId": string; "paymentMode": string; "clubId"?: string };
    'room.dissolve_apply': { "action": string; "payload": Readonly<Record<string, unknown>>; "reasonCode": string };
    'room.dissolve_vote': { "action": string; "payload": Readonly<Record<string, unknown>>; "voteId": string; "agree": boolean };
    'room.handoff': { "action": string; "payload": Readonly<Record<string, unknown>>; "roomId": string };
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
    'mahjong.afmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.afmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ahhbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ahhbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ahhnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ahhnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ahmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ahmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ak159mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ak159mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.aqmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.aqmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.asmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.asmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.aymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.aymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bdjhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bdjhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bdyxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bdyxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bfmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bfmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bzqzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bzqzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.bztdh.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.bztdh.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.caooszmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.caooszmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ccmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ccmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.chengdu1001.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.chengdu1001.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.chmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.chmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.cnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.csmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.csmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.cxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cxyxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.cxyxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.cylymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.cylymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.czczmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.czczmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.czdzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.czdzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.czmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.czmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dcwdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dcwdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dczbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dczbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.demomj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.demomj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dkgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dkgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dlaoomj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dlaoomj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dphmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dphmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dtlgfmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dtlgfmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dtmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dtmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dxbjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dxbjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.dzsjzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.dzsjzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fctdhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fctdhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fjyxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fjyxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fyddzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fyddzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fzgcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fzgcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fzjxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fzjxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.fzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.fzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gcbgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gcbgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gdczmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gdczmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gdjymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gdjymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gft258mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gft258mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.glqzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.glqzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gsjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gsjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gslzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gslzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gyzjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gyzjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.gzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.gzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.haxymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.haxymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbhbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hbhbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbtdhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hbtdhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbwhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hbwhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hbyxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hbyxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hebmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hebmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hfbzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hfbzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hfmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hfmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hhhgw.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hhhgw.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hldmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hldmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnaymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnaymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hncsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hncsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnhbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnhbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnjymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnjymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnjzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnjzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnpdsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnpdsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnsymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnsymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnxcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnxcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnxymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnxymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnyjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnyjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hnzzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hnzzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hstdhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hstdhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.htmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.htmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hyhsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hyhsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hylymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hylymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzbdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hzbdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzjdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hzjdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.hzwmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.hzwmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jayxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jayxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jcahmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jcahmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jchhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jchhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jdzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jdzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jlmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jlmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmgghmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jmgghmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmhhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jmhhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmjsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jmjsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jmskmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jmskmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsczmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsczmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsgymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsgymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jshamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jshamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsnyzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsnyzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jssnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jssnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jssqmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jssqmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jstdhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jstdhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsxymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsxymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsycmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsycmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jsyzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jsyzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jtmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jtmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxfzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jxfzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxndmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jxndmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jxxymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jxxymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jyessz.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jyessz.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.jzwzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.jzwzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.kfmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.kfmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.klmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.klmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ksmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ksmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lbhzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lbhzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lfphmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lfphmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lhgmmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lhgmmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lkmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lkmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.llfymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.llfymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lnjzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lnjzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lnsymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lnsymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lpmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lpmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lpsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lpsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ls13579.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ls13579.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lskjjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lskjjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lslwzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lslwzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lsxzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lsxzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lsyjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lsyjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lwmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lwmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lygcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lygcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lygmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lygmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.lzxzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.lzxzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.masmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.masmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.mmmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.mmmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.msmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.msmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.mymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.mymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.mzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.mzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.namj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.namj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nbcxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nbcxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ncaymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ncaymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ncmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ncmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ndmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ndmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.njlhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.njlhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.njmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.njmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nkbhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nkbhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nmgyzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nmgyzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.npgzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.npgzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.npmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.npmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ntcp.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ntcp.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nxkwmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nxkwmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nykwxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nykwxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nythmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nythmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nyxxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nyxxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.nzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.nzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pbyhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pbyhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pdsjxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pdsjxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pdslsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pdslsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pdsyxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pdsyxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.phmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.phmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pnyhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pnyhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pt13mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pt13mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ptmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ptmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.px258mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.px258mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pxzzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pxzzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.pzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.pzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qjfbbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qjfbbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qjfxjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qjfxjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qxwq.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qxwq.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qyphmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qyphmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qzcsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qzcsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qzkhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qzkhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.qzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.qzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rgjamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rgjamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rqmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rqmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rxew.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rxew.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.rzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.rzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scdymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.scdymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scgamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.scgamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scgxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.scgxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.scmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.scnjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.scnjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdfjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sdfjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdhzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sdhzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdjnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sdjnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdlcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sdlcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdlymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sdlymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sdzzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sdzzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sfphmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sfphmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sgew.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sgew.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.shqmmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.shqmmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.smmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.smmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sqmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sqmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sqsymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sqsymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sqycmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sqycmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.srmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.srmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sse.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sse.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ssmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ssmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sspmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sspmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.stmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.stmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ststmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ststmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.swmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.swmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxhtmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sxhtmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxlsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sxlsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxmmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sxmmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sxzjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sxzjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.symj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.symj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.sysybp.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.sysybp.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.szmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.szmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tamj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tamj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tbhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tbhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tbzfbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tbzfbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tdhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tdhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.thgjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.thgjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tjtgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tjtgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tjtjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tjtjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tmhhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tmhhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.twmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.twmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.txmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.txmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tzjjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tzjjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tzkzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tzkzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.tzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.tzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wabjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wabjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wgfhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wgfhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.whmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.whmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wnyh.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wnyh.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wxzmmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wxzmmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.wzqsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.wzqsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xfgzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xfgzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xgkwxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xgkwxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xhbbmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xhbbmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xhzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xhzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjbjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xjbjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjlshmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xjlshmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xjxzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xjxzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xl2vs2mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xl2vs2mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xlhzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xlhzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xlqmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xlqmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xmmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xmmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xnmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xnmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xplp.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xplp.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xtlhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xtlhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xtmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xtmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xuezhan.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xuezhan.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xwmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xwmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xxfqmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xxfqmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xxtdhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xxtdhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xygsmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xygsmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyhcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xyhcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyscmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xyscmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xyxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xyxxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xyxxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.xzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.xzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ybgxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ybgxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ycfxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ycfxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ycmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ycmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ycsgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ycsgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yctjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yctjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yddgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yddgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yfcgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yfcgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yfmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yfmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ygjzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ygjzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ygmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ygmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yhzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yhzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yjlymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yjlymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yjnxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yjnxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ykmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ykmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yldgzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yldgzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ysmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ysmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yszmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yszmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ytmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ytmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.ytyjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.ytyjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yxbzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yxbzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yxtdh.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yxtdh.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yzgymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yzgymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.yzyzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.yzyzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.za13mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.za13mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.za16mj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.za16mj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zass.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zass.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zcmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zcmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zgqzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zgqzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjgmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjgmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjhzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjhzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjjhmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjjhmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjqzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjqzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjshzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjshzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjtzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjtzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zjwzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zjwzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zklymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zklymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zkmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zkmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zmdmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zmdmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zpmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zpmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zxmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zxmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zymj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zymj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zzmj.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zzmj.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'mahjong.zzph.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'mahjong.zzph.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.anyue2005.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.anyue2005.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.bozhou2009.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.bozhou2009.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.chengdu2001.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.chengdu2001.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.chengdu2999.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.fuzhou2028.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.fuzhou2028.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.gaoan2025.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.gaoan2025.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.gushi2012.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.gushi2012.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.henan2019.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.henan2019.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.huaibin2021.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.huaibin2021.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.huaihua2015.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.huaihua2015.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.huangchuan2022.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.huangchuan2022.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.jian2011.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.jian2011.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.jiangsu2018.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.jiangsu2018.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.jingdezhen2017.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.jingdezhen2017.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.jintan2024.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.jintan2024.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.leping2008.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.leping2008.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.liangshan2003.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.liangshan2003.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.mianning2004.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.mianning2004.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.neijiang2002.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.neijiang2002.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.ningdu2014.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.ningdu2014.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.panzhihua2006.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.panzhihua2006.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.pdk.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.pdk.state_push': { "action": string; "payload": Readonly<Record<string, unknown>> };
    'poker.poyang2023.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.poyang2023.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.quanguo2997.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.quanguo2998.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.taizhou2020.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.taizhou2020.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.wannian2007.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.wannian2007.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.xiaogan2013.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.xiaogan2013.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.xinxian2016.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.xinxian2016.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.xuancheng2027.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.xuancheng2027.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.yixing2026.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.yixing2026.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'poker.yugan2010.dispatch': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number };
    'poker.yugan2010.state_push': { "payload": Readonly<Record<string, unknown>>; "stateVersion": number; "serverSeq": number };
    'replay.perspective_page': { "items": ReadonlyArray<unknown>; "nextSequence": number; "hasMore": boolean };
    'replay.query': { "viewerReplay": Readonly<Record<string, unknown>>; "viewType": string };
    'room.create': { "roomId": string; "roomSessionToken": string; "ruleSnapshotId": string };
    'room.dissolve_apply': { "voteId": string; "expiresAt": number };
    'room.dissolve_vote': { "accepted": boolean; "stateVersion": number };
    'room.handoff': { "accepted": boolean; "roomInstanceId": string; "lifecycleEpoch": string; "sessionId": string; "stateVersion": number; "eventSequence": string; "eventId": string; "connectionGeneration": string };
    'room.join': { "roomSessionToken": string; "playVersion": string; "ruleSnapshotId": string };
    'room.leave': { "left": boolean };
    'room.reconnect': { "viewerSnapshot": Readonly<Record<string, unknown>>; "events": ReadonlyArray<unknown>; "serverSeq": number; "hasMore": boolean; "roomInstanceId": string; "lifecycleEpoch": string; "sessionId": string; "stateVersion": number; "eventSequence": string; "eventId": string };
    'room.seat': { "stateVersion": number; "serverSeq": number };
    'system.heartbeat': { "serverTime": number };
    'system.kick_out': { "reasonCode": string; "message"?: string };
}
export type ProtocolRequestBody<K extends ProtocolId> = ProtocolRequestBodies[K];
export type ProtocolResponseBody<K extends ProtocolId> = ProtocolResponseBodies[K];
