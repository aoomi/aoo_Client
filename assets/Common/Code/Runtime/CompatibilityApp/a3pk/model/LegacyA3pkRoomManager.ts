// @ts-nocheck
// Generated from the Creator 2.2.2 A3PK model. Method bodies and protocol semantics are preserved.
export type LegacyA3pkAppContext = Record<string, any>;

export class LegacyA3pkRoomManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyA3pkAppContext) { this.Init(); }


    /**
     * 初始化
     */
  public Init() {

        this.JS_Name = "A3PKRoomMgr";

        this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
        this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
        this.NetManager = this.app[this.app.subGameName + "_NetManager"]();
        this.SysNotifyManager = this.app[this.app.subGameName + "_SysNotifyManager"]();

        this.A3PKRoom = this.app.A3PKRoom();
        this.A3PKRoomSet = this.app.A3PKRoomSet();

        this.NetManager.RegNetPack("a3pk.CA3PKCreateRoom", this.OnPack_CreateRoom, this);
        this.NetManager.RegNetPack("a3pk.CA3PKGetRoomInfo", this.OnPack_GetRoomInfo, this);
        this.NetManager.RegNetPack("a3pk.CA3PKRoomRecord", this.OnPack_RoomRecord, this);

        //notify
        this.NetManager.RegNetPack("SA3PK_SetStart", this.OnPack_SetStart, this);
        this.NetManager.RegNetPack("SA3PK_SetEnd", this.OnPack_SetEnd, this);
        this.NetManager.RegNetPack("SA3PK_StartRound", this.OnPack_StartRound, this);
        this.NetManager.RegNetPack("SA3PK_RoomEnd", this.OnPack_RoomEnd, this);
        this.NetManager.RegNetPack("SA3PK_RoomStart", this.OnPack_RoomStart, this);

        this.NetManager.RegNetPack("SA3PK_PosOpCard", this.OnPack_PosOpCard, this);
        this.NetManager.RegNetPack("SA3PK_OpCardEX", this.OnPack_OpCardEX, this);
        
        this.NetManager.RegNetPack("SA3PK_UpdatePoint", this.OnPack_UpdatePoint, this);
        this.NetManager.RegNetPack("SA3PK_PartnerPosList", this.OnPack_PartnerPosList, this);

        this.NetManager.RegNetPack("SA3PK_ChangeStatus", this.OnPack_ChangeStatus, this);
        this.NetManager.RegNetPack("SA3PK_RandomPartner", this.OnPack_RandomPartner, this);
        this.NetManager.RegNetPack("SA3PK_CleanPosCard", this.OnPack_CleanPosCard, this);
        this.NetManager.RegNetPack("SA3PK_SeeCard", this.OnPack_SeeCard, this);
        this.NetManager.RegNetPack("SA3PK_OpenCard", this.OnPack_OpenCard, this);
        this.app[this.app.subGameName + "Client"].RegEvent("CodeError", this.Event_CodeError, this);


        this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_Chatmessage", this.OnPack_ChatMessage, this);


        //俱乐部积分通知
        this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_ClubCentNotEnough", this.OnPack_ClubCentNotEnough, this);
        this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_ClubCentEnough", this.OnPack_ClubCentEnough, this);
        this.NetManager.RegNetPack("SRoom_ClubCentChange", this.OnPack_ClubCentChange, this);

        this.HeroManager = this.app[this.app.subGameName + "_HeroManager"]();

        this.OnReload();

        this.Log("Init");
  }

    /**
     * 重登
     */
  public OnReload() {
        this.enterRoomID = 0;
        //获取启动客户端进入的房间KEY
        this.loginEnterRoomKey = 0;

        this.A3PKRoom.OnReload();
  }

  public OnSwithSceneEnd(sceneType) {

        //如果退出房间场景了,清除数据
        if (sceneType != "fightScene") {
            this.OnReload();
        }
  }

    //----------------------收包接口-----------------------------
  public Event_CodeError(event) {
        let codeInfo = event.detail || event;
        if (codeInfo["Code"] == this.app[this.app.subGameName + "_ShareDefine"]().NotEnoughCoin) {
            this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg('金币不足，无法创建房间');
        }
  }

  public OnPack_StartRound(serverPack) {
        console.log("round开始 OnPack_StartRound", serverPack);
        let roomID = serverPack["roomID"];
        let setRound = serverPack["room_SetWait"];
        this.A3PKRoom.GetRoomSet().OnStartRound(setRound);
        this.app[this.app.subGameName + "Client"].OnEvent("A3PK_StartRound", serverPack);
  }
  public OnPack_ChatMessage(serverPack) {
        this.app[this.app.subGameName + "Client"].OnEvent("ChatMessage", serverPack);
  }
    //创建房间完成
  public OnPack_CreateRoom(serverPack) {
        let agrs = Object.keys(serverPack);
        if (0 == agrs.length)//俱乐部会回空包
            return;
        if (serverPack.createType == 2) {
            this.app[this.app.subGameName + "_FormManager"]().ShowForm('UIDaiKai');
            this.app[this.app.subGameName + "_FormManager"]().CloseForm('UICreatRoom');
        } else {
            this.SendGetRoomInfo(serverPack.roomID);
        }
  }
  public OnPack_PartnerPosList(serverPack) {
        this.A3PKRoomSet.OnPartner(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("A3PKPartnerPosList", serverPack);
  }
  public OnPack_SeeCard(serverPack) {
        this.A3PKRoomSet.OnSeeCard(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("SeeCard", serverPack);
  }
    //获取到房间完整信息
  public OnPack_GetRoomInfo(serverPack) {
        if (serverPack["NotFind_Player"]) {
            this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg('PLAYER_NOT_ROOM');
            this.app[this.app.subGameName+"Client"].ExitGame();
            return;
        } else if (serverPack["NotFind_Room"]) {
            this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg('Room_NotFindRoom');
            this.app[this.app.subGameName+"Client"].ExitGame();
            return;
        }

        this.enterRoomID = serverPack["roomID"];
        this.clubId = serverPack["cfg"]["clubId"];
        this.unionId = serverPack["cfg"]["unionId"];
        this.A3PKRoom.OnInitRoomData(serverPack);
        console.log("获取到房间完整信息 OnPack_GetRoomInfo", serverPack);
        //进入打牌场景
        this.app[this.app.subGameName + "_SceneManager"]().LoadScene("a3pkScene");
  }
    //--------------notify-----------------
    //set开始
  public OnPack_SetStart(serverPack) {
        console.log("set开始 OnPack_SetStart", serverPack);
        let roomID = serverPack["roomID"];
        let setInfo = serverPack["setInfo"];
        this.A3PKRoom.OnSetStart(setInfo);
        this.app[this.app.subGameName + "Client"].OnEvent("A3PKSetStart", serverPack);
  }

  public OnPack_PosReady(serverPack) {
        let roomID = serverPack["roomID"];
        let pos=serverPack["pos"];
        let isPosReady=serverPack["isPosReady"];
        //SetPosRead
        this.ZJMJRoomPosMgr.SetPosReady(pos,isPosReady);
        this.app[this.app.subGameName + "Client"].OnEvent("A3PK_PosReady", serverPack);
  }
  public OnPack_UpdatePoint(serverPack) {
        this.A3PKRoomSet.UpdatePoint(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("A3PK_UpdatePoint", serverPack);
  }
    //set结束
  public OnPack_SetEnd(serverPack) {
        let roomID = serverPack["roomID"];
        let setEnd = serverPack["setEnd"];
        this.A3PKRoom.OnSetEnd(setEnd);
        this.app[this.app.subGameName + "Client"].OnEvent("A3PKSetEnd", serverPack);
  }

    //房间开始
  public OnPack_RoomStart(serverPack) {
        console.log("房间开始 OnPack_RoomStart", serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("RoomStart", {});
  }


    //俱乐部积分不足时通知
  public OnPack_ClubCentNotEnough(serverPack) {
        this.app[this.app.subGameName + "Client"].OnEvent("ClubCentNotEnough", serverPack);
  }
  public OnPack_ClubCentEnough(serverPack) {
        this.app[this.app.subGameName + "Client"].OnEvent("ClubCentEnough", serverPack);
  }
    //玩家的俱乐部积分在游戏外被改变通知
  public OnPack_ClubCentChange(serverPack) {
        this[this.app.subGameName.toUpperCase()+"Room"].OnClubCentChange(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("RoomClubCentChange", serverPack);
  }


  public OnPack_PosOpCard(serverPack) {
        console.log("OnPack_PosOpCard", serverPack);
        this.A3PKRoomSet.OnOpCard(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("OpCard", serverPack);
  }

  public OnPack_OpCardEX(serverPack) {
        console.log(" OnPack_OpCardEX", serverPack);
        this.A3PKRoomSet.OnOpCardEX(serverPack);
        let outList = serverPack["outList"];
        for (let i = 0; i < outList.length; i++) {
        	let outPos = outList[i];
        	let shouCard = outPos["set_Pos"]["shouCard"];
        	if (shouCard.length > 0) {
		        this.A3PKRoomSet.UpdateHandCard(shouCard, []);
	        }
        }
        this.app[this.app.subGameName + "Client"].OnEvent("OpCardEX", serverPack);
  }


  public OnPack_ChangeStatus(serverPack) {
        console.log(" OnPack_ChangeStatus", serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("ChangeStatus", serverPack);
  }
  public OnPack_RandomPartner(serverPack) {
        console.log(" OnPack_RandomPartner", serverPack);
        this.A3PKRoomSet.OnRandomPartner(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("RandomPartner", serverPack);
  }
  public OnPack_CleanPosCard(serverPack) {
        this.app[this.app.subGameName + "Client"].OnEvent("CleanPosCard", serverPack);
  }

  public OnPack_OpenCard(serverPack) {
        console.log(" OnPack_OpenCard", serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("OpenCard", serverPack);
  }

    

    //房间结束
  public OnPack_RoomEnd(serverPack) {
        console.log("房间结束 OnPack_RoomEnd", serverPack);
        this.A3PKRoom.OnRoomEnd(serverPack);
        this.app[this.app.subGameName + "Client"].OnEvent("RoomEnd", serverPack);
  }

    //获取对局记录信息
  public OnPack_RoomRecord(serverPack) {
        console.log("获取对局记录信息 OnPack_RoomRecord", serverPack);
        let records = serverPack["records"];
        this.A3PKRoom.RoomRecord(records);
        this.app[this.app.subGameName + "Client"].OnEvent("RoomRecord", records);
  }

    //---------------------获取接口------------------------------
  public GetEnterRoomID() {
        return this.enterRoomID
  }

  public GetEnterRoom() {
        if (!this.enterRoomID) {
            this.ErrLog("GetEnterRoom not enterRoom");
            return
        }
        return this.A3PKRoom
  }
    //-----------------------发包函数-----------------------------


    //登录获取当前进入的房间ID
  public SendGetCurRoomID() {
        this.NetManager.requestV2("game.C1101GetRoomID", {});
  }

    //发送创建房间
  public SendCreateRoom(sendPack) {
        console.log("发送创建房间 SendCreateRoom", sendPack);
        this.NetManager.requestV2("a3pk.CA3PKCreateRoom", sendPack);
  }

    //获取房间信息
  public SendGetRoomInfo(roomID, callback) {
        console.log("获取房间信息 SendGetRoomInfo", roomID, callback);
        this.NetManager.requestV2("a3pk.CA3PKGetRoomInfo", {"roomID": roomID}, callback);
  }

    //解散房间
  public SendDissolveRoom(roomID) {
        console.log("解散房间 SendDissolveRoom", roomID);
        this.NetManager.requestV2("a3pk.CA3PKDissolveRoom", {"roomID": roomID});
  }

    //位置发送准备状态
  public SendReady(roomID, posIndex) {
        console.log("位置发送准备状态 SendReady", roomID, posIndex);
        this.NetManager.requestV2("a3pk.CA3PKReadyRoom", {"roomID": roomID, "posIndex": posIndex});
  }

    //发送取消准备状态
  public SendUnReady(roomID, posIndex) {
        console.log("发送取消准备状态 SendUnReady", roomID, posIndex);
        this.NetManager.requestV2("a3pk.CA3PKUnReadyRoom", {"roomID": roomID, "posIndex": posIndex});
  }

    //房主T人
  public SendKickPosIndex(roomID, posIndex) {
        console.log("房主T人 SendKickPosIndex", roomID, posIndex);
        this.NetManager.requestV2("a3pk.CA3PKKickRoom", {"roomID": roomID, "posIndex": posIndex});
  }

    //开始游戏
  public SendStartRoomGame(roomID) {
        console.log("开始游戏 SendStartRoomGame", roomID);
        this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "StartGame", {"roomID": roomID});
  }

    //发送继续游戏
  public SendContinueGame(roomID) {
        console.log("发送继续游戏 SendContinueGame", roomID);
        this.NetManager.requestV2("a3pk.CA3PKContinueGame", {"roomID": roomID});
  }
  public SendTimeOutContinue() {
        this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"TimeOutContinue", {"roomID": this.enterRoomID}, (data) => {
            console.log("延迟继续", data);
        }, (error) => {
            console.log("延迟继续错误", error);
        });
  }
    //发送同意解散房间
  public SendDissolveRoomAgree(roomID) {
        console.log("发送同意解散房间 SendDissolveRoomAgree", roomID);
        this.NetManager.requestV2("a3pk.CA3PKDissolveRoomAgree", {"roomID": roomID});
  }

    //发送拒绝解散房间
  public SendDissolveRoomRefuse(roomID) {
        console.log("发送拒绝解散房间 SendDissolveRoomRefuse", roomID);
        this.NetManager.requestV2("a3pk.CA3PKDissolveRoomRefuse", {"roomID": roomID});
  }

    //退出房间
  public SendExitRoom(roomID, pos) {
        console.log("退出房间 SendExitRoom", roomID, pos);
        this.NetManager.requestV2("a3pk.CA3PKExitRoom", {"roomID": roomID, "posIndex": pos});
  }

    //请求对局记录封包
  public SendRoomRecord(roomID) {
        console.log("请求对局记录封包 SendRoomRecord", roomID);
        this.NetManager.requestV2("a3pk.CA3PKRoomRecord", {"roomID": roomID});
  }

    //获取每一局的玩家记录
  public sendEveryGameRecord(roomID) {
        console.log("获取每一局的玩家记录 sendEveryGameRecord", roomID);
        this.NetManager.requestV2("game.CPlayerSetRoomRecord", {"roomID": roomID});
  }

  public SendEndRoom(roomID) {
        console.log(" SendEndRoom", roomID);
        this.NetManager.requestV2("a3pk.CA3PKEndRoom", {"roomID": roomID});
  }

  public SendOpCard(sendPack) {
        console.log(" SendOpCard", sendPack);
        this.NetManager.requestV2("a3pk.CA3PKOpCard", sendPack);
  }
  public SendDuShi(sendPack) {
        this.NetManager.requestV2("a3pk.CA3PKChallengeOp", sendPack);
  }
  public SendFaPaiFinish(pos) {
        if (!this.enterRoomID) {
            return
        }
        let roomID = this.enterRoomID;
        let sendPack = {
            "roomID": roomID,
            "pos": pos,
        };
        this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase()  + "FaPaiJieShu", sendPack);
  }
  public SendOpenCard(roomID, isOpen, multiple) {
        console.log(" SendOpenCard", roomID, isOpen, multiple);
        this.NetManager.requestV2("a3pk.CA3PKOpenCard", {"roomID": roomID, "OpenCard": isOpen, "multiple": multiple});
  }

  public SendChooseCard(roomID,chooseCardType,cardList) {
        this.NetManager.requestV2("a3pk.CA3PKChooseCard", {"roomID": roomID, "chooseCardType": chooseCardType, "cardList": cardList});
  }

  public SendLiPai(liPais) {
        if (!this.enterRoomID) {
            return;
        }
        let roomID = this.enterRoomID;
        let sendPack = {
            "roomID": roomID,
            "liPaiList": liPais,
        };
        this.NetManager.requestV2("a3pk.CA3PKLiPai", sendPack);
  }
}
