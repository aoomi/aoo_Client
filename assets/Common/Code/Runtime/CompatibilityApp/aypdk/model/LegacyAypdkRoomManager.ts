// @ts-nocheck
// Generated from the Creator 2.2.2 AYPDK room model; method bodies and protocol semantics are preserved.
export type LegacyAypdkAppContext = Record<string, any>;
export class LegacyAypdkRoomManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAypdkAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app.subGameName.toUpperCase()+"RoomMgr";

		this.ComTool = this.app[this.app.subGameName+"_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName+"_ShareDefine"]();
		this.NetManager = this.app[this.app.subGameName+"_NetManager"]();
		this.SysNotifyManager = this.app[this.app.subGameName+"_SysNotifyManager"]();

		this.Room = this.app[this.app.subGameName.toUpperCase()+"Room"]();

		this.NetManager.RegNetPack(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"CreateRoom", this.OnPack_CreateRoom, this);
		this.NetManager.RegNetPack(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"GetRoomInfo", this.OnPack_GetRoomInfo, this);
		this.NetManager.RegNetPack(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"RoomRecord", this.OnPack_RoomRecord, this);

		//notify
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_SetStart", this.OnPack_SetStart, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_SetEnd", this.OnPack_SetEnd, this);

		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_RoomEnd", this.OnPack_RoomEnd, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_RoomStart", this.OnPack_RoomStart, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_OpCard", this.OnPack_OpCard, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_ChangeStatus", this.OnPack_ChangeStatus, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_AddDouble", this.OnPack_AddDouble, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_OpenCard", this.OnPack_OpenCard, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_RobClose", this.OnPack_RobClose, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_Chatmessage", this.OnPack_ChatMessage, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_NotifySC", this.OnPack_NotifySC, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_CardNumber", this.OnPack_CardNumber, this);

		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_AddBombScore", this.OnPack_AddBombScore, this);

		//俱乐部积分通知
		this.NetManager.RegNetPack("SAYPDK_ClubCentNotEnough", this.OnPack_ClubCentNotEnough, this);
		this.NetManager.RegNetPack("SAYPDK_ClubCentEnough", this.OnPack_ClubCentEnough, this);

		this.NetManager.RegNetPack("SRoom_ClubCentChange", this.OnPack_ClubCentChange, this);

		this.HeroManager = this.app[this.app.subGameName+"_HeroManager"]();

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

		this.Room.OnReload();
  }

  public OnSwithSceneEnd(sceneType) {

		//如果退出房间场景了,清除数据
		if(sceneType != "fightScene"){
			this.OnReload();
		}
  }

	//----------------------收包接口-----------------------------
	//创建房间完成
  public OnPack_CreateRoom(serverPack) {
		let agrs = Object.keys(serverPack);
        if(0 == agrs.length)//俱乐部会回空包
            return;
		if(serverPack.createType==2){
			this.app[this.app.subGameName+"_FormManager"]().ShowForm('UIDaiKai');
            this.app[this.app.subGameName+"_FormManager"]().CloseForm('UICreatRoom');
		}else{
			this.SendGetRoomInfo(serverPack.roomID);
		}
  }

	//获取到房间完整信息
  public OnPack_GetRoomInfo(serverPack) {

		if(serverPack["NotFind_Player"]){
			this.app[this.app.subGameName+"_SysNotifyManager"]().ShowSysMsg('PLAYER_NOT_ROOM');
			this.app[this.app.subGameName + "Client"].ExitGame();
			return;
		}
		else if(serverPack["NotFind_Room"]){
			this.app[this.app.subGameName+"_SysNotifyManager"]().ShowSysMsg('Room_NotFindRoom');
			this.app[this.app.subGameName + "Client"].ExitGame();
			return;
		}

		this.enterRoomID = serverPack["roomID"];
		this.clubId = serverPack["cfg"]["clubId"];
		this.unionId = serverPack["cfg"]["unionId"];
		this.Room.OnInitRoomData(serverPack);
		//进入打牌场景
		if (this.app[this.app.subGameName + "_SceneManager"]().GetSceneType()!="aypdkScene") {
			this.app[this.app.subGameName + "_SceneManager"]().LoadScene("aypdkScene");
		}else{
			this.app[this.app.subGameName + "_FormManager"]().ShowForm('game/AYPDK/UIAYPDK_Play');
		}
		
  }
	//--------------notify-----------------
	//set开始
  public OnPack_SetStart(serverPack) {
		let roomID = serverPack["roomID"];
		let setInfo = serverPack["setInfo"];
		this.Room.OnSetStart(setInfo);
		this.app[this.app.subGameName+"Client"].OnEvent(this.app.subGameName.toUpperCase()+"SetStart", serverPack);
  }

  public OnPack_NotifySC(serverPack) {
		this.app[this.app.subGameName+"Client"].OnEvent("NotifySC", serverPack);
  }

  public OnPack_AddBombScore(serverPack) {
		this.app[this.app.subGameName+"Client"].OnEvent(this.app.subGameName.toUpperCase()+"_AddBombScore", serverPack);
  }
	//set结束
  public OnPack_SetEnd(serverPack) {
		this.Room.OnSetEnd(serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent(this.app.subGameName.toUpperCase()+"SetEnd", serverPack);
  }

	//房间开始
  public OnPack_RoomStart(serverPack) {
		this.ErrLog("OnPack_RoomStart:", serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("RoomStart", {});
  }

  public OnPack_OpCard(serverPack) {
		console.log("serverPack =="+serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("OpCard", serverPack);
  }

  public OnPack_ChangeStatus(serverPack) {
		console.log("改变玩家出牌位置和游戏状态");
		this.Room.OnPlaying(serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("ChangeStatus", serverPack);
  }

  public OnPack_AddDouble(serverPack) {
		console.log("显示玩家倍数");
		this.app[this.app.subGameName+"Client"].OnEvent("AddDouble", serverPack);
  }

  public OnPack_OpenCard(serverPack) {
		this.app[this.app.subGameName+"Client"].OnEvent("OpenCard", serverPack);
  }

  public OnPack_RobClose(serverPack) {
		this.app[this.app.subGameName+"Client"].OnEvent("RobClose", serverPack);
  }
	
  public OnPack_ChatMessage(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ChatMessage", serverPack);
  }

  public OnPack_ClubCentNotEnough(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ClubCentNotEnough", serverPack);
  }
  public OnPack_ClubCentEnough(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ClubCentEnough", serverPack);
  }

	//玩家的俱乐部积分在游戏外被改变通知
  public OnPack_ClubCentChange(serverPack) {
		this.Room.OnClubCentChange(serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomClubCentChange", serverPack);
  }
	//记牌器通知
  public OnPack_CardNumber(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("CardNumber", serverPack);
  }
	//房间结束
  public OnPack_RoomEnd(serverPack) {
		this.Room.OnRoomEnd(serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("RoomEnd", serverPack);
  }

    //获取对局记录信息
  public OnPack_RoomRecord(serverPack) {
		let records = serverPack["records"];
		this.Room.RoomRecord(records);
        this.app[this.app.subGameName+"Client"].OnEvent("RoomRecord", records);
  }

	//---------------------获取接口------------------------------
  public GetEnterRoomID() {
		return this.enterRoomID
  }

  public GetEnterRoom() {
		if(!this.enterRoomID){
			this.ErrLog("GetEnterRoom not enterRoom");
			return
		}
		return this.Room
  }
	//-----------------------发包函数-----------------------------


	//登录获取当前进入的房间ID
  public SendGetCurRoomID() {
		this.NetManager.requestV2("game.C1101GetRoomID", {});
  }
	
	//发送创建房间
  public SendCreateRoom(sendPack) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"CreateRoom", sendPack);
  }

	//获取房间信息
  public SendGetRoomInfo(roomID, callback) {
		console.log('SendGetRoomInfo begin aypdk')
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"GetRoomInfo", {"roomID":roomID}, callback);
  }

	//解散房间
  public SendDissolveRoom(roomID) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"DissolveRoom", {"roomID":roomID});
  }

	//位置发送准备状态
  public SendReady(roomID, posIndex) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"ReadyRoom", {"roomID":roomID, "posIndex":posIndex});
  }

	//发送取消准备状态
  public SendUnReady(roomID, posIndex) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"UnReadyRoom", {"roomID":roomID, "posIndex":posIndex});
  }

	//房主T人
  public SendKickPosIndex(roomID, posIndex) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"KickRoom", {"roomID":roomID, "posIndex":posIndex});
  }

	//开始游戏
  public SendStartRoomGame(roomID) {
		console.log('SendStartRoomGame roomID',roomID);
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"StartGame", {"roomID":roomID});
  }

	//发送继续游戏
  public SendContinueGame(roomID) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"ContinueGame", {"roomID":roomID});
  }

	//发送同意解散房间
  public SendDissolveRoomAgree(roomID) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"DissolveRoomAgree", {"roomID":roomID});
  }

	//发送拒绝解散房间
  public SendDissolveRoomRefuse(roomID) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"DissolveRoomRefuse", {"roomID":roomID});
  }

	//退出房间
  public SendExitRoom(roomID, pos) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"ExitRoom", {"roomID":roomID, "posIndex":pos});
  }

	//请求对局记录封包
  public SendRoomRecord(roomID) {
        this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"RoomRecord", {"roomID":roomID});
  }

    //获取每一局的玩家记录
  public sendEveryGameRecord(roomID) {
    	this.NetManager.requestV2("game.CPlayerSetRoomRecord", {"roomID":roomID});
  }
	
  public SendEndRoom(roomID) {
    	this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"EndRoom", {"roomID":roomID});
  }

  public SendOpCard(sendPack) {
    	this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"OpCard", sendPack);
  }
	
  public SendAddDouble(roomID, pos, addDouble) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"AddDouble", {"roomID":roomID,"pos":pos,"addDouble":addDouble});
  }

  public SendRoobDoor(roomID, pos, isRob) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"RobClose", {"roomID":roomID,"pos":pos,"robClose":isRob});
  }

  public SendOpenCard(roomID, pos, isOpen) {
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"OpenCard", {"roomID":roomID,"pos":pos,"OpenCard":isOpen});
	}
}
