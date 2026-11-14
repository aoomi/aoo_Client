// @ts-nocheck
// Generated from Creator 2.4.8 by tools/migrate-pdk-models.mjs.
// Legacy method bodies are preserved; only the BaseClass container is replaced.
export type PdkAppContext = Record<string, any>;

export class PdkRoomManager {
    public constructor(private readonly app: PdkAppContext) {
        this.Log = this.Log ?? (() => undefined);
        this.ErrLog = this.ErrLog ?? (() => undefined);
        this.Init();
    }



	/**
	 * 初始化
	 */
	public Init(){

		this.JS_Name = this.app.subGameName.toUpperCase()+"RoomMgr";

		this.ComTool = this.app[this.app.subGameName+"_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName+"_ShareDefine"]();
		this.NetManager = this.app[this.app.subGameName+"_NetManager"]();
		this.SysNotifyManager = this.app[this.app.subGameName+"_SysNotifyManager"]();

		this.Room = this.app[this.app.subGameName.toUpperCase()+"Room"]();

		// The migrated runtime owns the v2 authoritative subscriptions.  The old
		// per-packet registration table used to install a second room lifecycle
		// (including CommonRoom/form and social handlers) on every PDK instance.
		// Keep the legacy handlers below callable for archived adapters, but never
		// register them on the production path.  PdkRuntime subscribes to the
		// canonical common.room/poker.* envelopes exactly once.
		this.HeroManager = this.app[this.app.subGameName+"_HeroManager"]();

		this.OnReload();

		this.Log("Init");
	}
	/**
	 * 重登
	 */
	public OnReload(){
		this.enterRoomID = 0;
		//获取启动客户端进入的房间KEY
		this.loginEnterRoomKey = 0;

		this.Room.OnReload();
	}
	//----------------------收包接口-----------------------------
	//创建房间完成
	public OnPack_CreateRoom(serverPack){
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
	public applyAuthoritativeRoomSnapshot(serverPack){

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

		// Scene/form mounting belongs to CommonRoom's runtime lifecycle.  This
		// model method only commits the authoritative room data; PdkRuntime
		// notifies its caller after enterRoom() has completed.

	}
	/**
	 * @deprecated Kept as a narrow migration alias for archived callers. It is
	 * not registered with the network and cannot mount a room or a public form.
	 */
	public OnPack_GetRoomInfo(serverPack){
		return this.applyAuthoritativeRoomSnapshot(serverPack);
	}
	//--------------notify-----------------
	//set开始
	public OnPack_SetStart(serverPack){
		let roomID = serverPack["roomID"];
		let setInfo = serverPack["setInfo"];
		this.Room.OnSetStart(setInfo);
		this.app[this.app.subGameName+"Client"].OnEvent(this.app.subGameName.toUpperCase()+"SetStart", serverPack);
	}
	public OnPack_NotifySC(serverPack){
		this.app[this.app.subGameName+"Client"].OnEvent("NotifySC", serverPack);
	}
	public OnPack_AddBombScore(serverPack){
		this.app[this.app.subGameName+"Client"].OnEvent(this.app.subGameName.toUpperCase()+"_AddBombScore", serverPack);
	}
	//set结束
	public OnPack_SetEnd(serverPack){
		this.Room.OnSetEnd(serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent(this.app.subGameName.toUpperCase()+"SetEnd", serverPack);
	}
	//房间开始
	public OnPack_RoomStart(serverPack){
		this.ErrLog("OnPack_RoomStart:", serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("RoomStart", {});
	}
	public OnPack_OpCard(serverPack){
		console.log("serverPack =="+serverPack);
		if(serverPack.cardList.length){
			this.app[this.app.subGameName+"Client"].OnEvent("OpCard", serverPack);
		}else{
			//this.app[this.app.subGameName+"Client"].OnEvent("OpCard", serverPack);
			setTimeout(()=>{
				this.app[this.app.subGameName+"Client"].OnEvent("OpCard", serverPack);
			},1000)
		}

	}
	public OnPack_ChangeStatus(serverPack){
		console.log("改变玩家出牌位置和游戏状态");
		this.Room.OnPlaying(serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("ChangeStatus", serverPack);
	}
	public OnPack_AddDouble(serverPack){
		console.log("显示玩家倍数");
		this.app[this.app.subGameName+"Client"].OnEvent("AddDouble", serverPack);
	}
	public OnPack_OpenCard(serverPack){
		this.app[this.app.subGameName+"Client"].OnEvent("OpenCard", serverPack);
	}
	public OnPack_RobClose(serverPack){
		this.app[this.app.subGameName+"Client"].OnEvent("RobClose", serverPack);
	}
	public OnPack_ChatMessage(serverPack){
		this.app[this.app.subGameName + "Client"].OnEvent("ChatMessage", serverPack);
	}
	public OnPack_ClubCentNotEnough(serverPack){
		this.app[this.app.subGameName + "Client"].OnEvent("ClubCentNotEnough", serverPack);
	}
	public OnPack_ClubCentEnough(serverPack){
		this.app[this.app.subGameName + "Client"].OnEvent("ClubCentEnough", serverPack);
	}
	//玩家的俱乐部积分在游戏外被改变通知
	public OnPack_ClubCentChange(serverPack){
		this.Room.OnClubCentChange(serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomClubCentChange", serverPack);
	}
	//记牌器通知
	public OnPack_CardNumber(serverPack){
		this.app[this.app.subGameName + "Client"].OnEvent("CardNumber", serverPack);
	}
	//房间结束
	public OnPack_RoomEnd(serverPack){
		this.Room.OnRoomEnd(serverPack);
		this.app[this.app.subGameName+"Client"].OnEvent("RoomEnd", serverPack);
	}
    //获取对局记录信息
    public OnPack_RoomRecord(serverPack){
		let records = serverPack["records"];
		this.Room.RoomRecord(records);
        this.app[this.app.subGameName+"Client"].OnEvent("RoomRecord", records);
    }
	//---------------------获取接口------------------------------
	public GetEnterRoomID(){
		return this.enterRoomID
	}
	public GetEnterRoom(){
		if(!this.enterRoomID){
			this.ErrLog("GetEnterRoom not enterRoom");
			return
		}
		return this.Room
	}
	//-----------------------发包函数-----------------------------


	//登录获取当前进入的房间ID
	//发送创建房间
	//获取房间信息
	public SendGetRoomInfo(roomID, callback){
		console.log('SendGetRoomInfo begin pdk')
		this.NetManager.requestV2(this.app.subGameName+".C"+this.app.subGameName.toUpperCase()+"GetRoomInfo", {"roomID":roomID}, callback);
	}
	//解散房间
	//位置发送准备状态
	//发送取消准备状态
	//房主T人
	//开始游戏
	//发送继续游戏
	//发送同意解散房间
	//发送拒绝解散房间
	//退出房间
	//请求对局记录封包
    //获取每一局的玩家记录
}
