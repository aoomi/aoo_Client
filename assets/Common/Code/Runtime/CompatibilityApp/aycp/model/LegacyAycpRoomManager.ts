// @ts-nocheck
// Generated from the Creator 2.2.2 AYCP room model; method bodies and protocol semantics are preserved.
export type LegacyAycpAppContext = Record<string, any>;
export class LegacyAycpRoomManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAycpAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app.subGameName.toUpperCase() + "RoomMgr";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.NetManager = this.app[this.app.subGameName + "_NetManager"]();
		this.FormManager = this.app[this.app.subGameName + "_FormManager"]();
		this.SysNotifyManager = this.app[this.app.subGameName + "_SysNotifyManager"]();

		this.Room = this.app[this.app.subGameName.toUpperCase() + "Room"]();

		this.NetManager.RegNetPack(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "CreateRoom", this.OnPack_CreateRoom, this);
		this.NetManager.RegNetPack(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "GetRoomInfo", this.OnPack_GetRoomInfo, this);
		this.NetManager.RegNetPack(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "RoomRecord", this.OnPack_RoomRecord, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_CardReadyChg", this.OnPack_CardReadyChg, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_ChangeStatus", this.Event_ChangeStatus, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SetStart", this.OnPack_SetStart, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SetEnd", this.OnPack_SetEnd, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_StartRound", this.OnPack_StartRound, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_PosGetCard", this.OnPack_PosGetCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_FanPai", this.OnPack_PosFanPai, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_TouPai", this.OnPack_PosTouPai, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_PosOpCard", this.OnPack_PosOpCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_OpPiao", this.OnPack_PosOpPiao, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_RoomEnd", this.OnPack_RoomEnd, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_RoomStart", this.OnPack_RoomStart, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_reward", this.OnPack_Reward, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SetPosCard", this.OnPack_SetPosCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_Chatmessage", this.OnPack_ChatMessage, this);

		//竞技点通知
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_ClubCentNotEnough", this.OnPack_ClubCentNotEnough, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_ClubCentEnough", this.OnPack_ClubCentEnough, this);
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

		this.Room.OnReload();
  }

  public OnSwithSceneEnd(sceneType) {

		//如果退出房间场景了,清除数据
		if (sceneType != "fightScene") {
			this.OnReload();
		}
  }
  public CheckOnEvent(serverPack) {
		if (serverPack["roomID"] == this.enterRoomID) {
			return true;
		}
		return false;
  }
	//----------------------收包接口-----------------------------


	//创建房间完成
  public OnPack_CreateRoom(serverPack) {
		console.log("创建房间完成 OnPack_CreateRoom", serverPack);
		let agrs = Object.keys(serverPack);
		if (0 == agrs.length)//俱乐部会回空包
			return;
		if (serverPack.createType == 2) {
			// this.app[this.app.subGameName + "_FormManager"]().ShowForm('UIDaiKai');
			this.app[this.app.subGameName + "_FormManager"]().CloseForm(this.app.subGameName + "_UICreatRoom");
		} else {
			this.SendGetRoomInfo(serverPack.roomID);
		}
  }


	//获取到房间完整信息
  public OnPack_GetRoomInfo(serverPack) {
		console.log("获取到房间完整信息 OnPack_GetRoomInfo", serverPack);
		if (serverPack["NotFind_Player"]) {
			this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg('PLAYER_NOT_ROOM');
			this.app[this.app.subGameName + "Client"].ExitGame();
			return;
		}
		else if (serverPack["NotFind_Room"]) {
			this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg('Room_NotFindRoom');
			this.app[this.app.subGameName + "Client"].ExitGame();
			return;
		}


		this.enterRoomID = serverPack["roomID"];
		this.clubId = serverPack["cfg"]["clubId"];
		this.unionId = serverPack["cfg"]["unionId"];
		this.Room.OnInitRoomData(serverPack);
		this.Room.OnTotalScoreFromLogin(serverPack["posList"]);
		this.Room.OnDissolve(serverPack["dissolve"]);
		for (let idx = 0; idx < serverPack.posList.length; idx++) {
			let playerInfo = serverPack.posList[idx];
			if (this.app[this.app.subGameName + "_HeroManager"]().GetHeroID() == playerInfo.pid) {
				this.app[this.app.subGameName + "_GameManager"]().SetAutoPlayIng(playerInfo.trusteeship);
			}
		}
		//进入打牌场景
		if (this.app[this.app.subGameName + "_SceneManager"]().GetSceneType() != this.app.subGameName + "Scene") {
			this.app[this.app.subGameName + "_SceneManager"]().LoadScene(this.app.subGameName + "Scene");
		} else {
			this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "Play");
		}
  }
	//--------------notify-----------------


	//set开始
  public OnPack_SetStart(serverPack) {
		console.log("set开始 OnPack_SetStart", serverPack);
		let setInfo = serverPack["setInfo"];
		this.Room.OnSetStart(setInfo);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SetStart", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("SetStart", serverPack);
  }

	//set结束
  public OnPack_SetEnd(serverPack) {
		console.log("set结束 OnPack_SetEnd", serverPack);
		let setEnd = serverPack["setEnd"];
		setEnd["roomEnd"] = serverPack["roomEnd"];
		this.Room.OnSetEnd(setEnd);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SetEnd", serverPack);
  }

	//房间结束
  public OnPack_RoomEnd(serverPack) {
		console.log("房间结束 OnPack_RoomEnd", serverPack);
		this.Room.OnRoomEnd(serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomEnd", serverPack);
  }
	//round开始
  public OnPack_StartRound(serverPack) {
		console.log("round开始 OnPack_StartRound", serverPack);
		let setRound = serverPack["room_SetWait"];
		this.Room.GetRoomSet().OnStartRound(setRound);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_StartRound", serverPack);
  }

	//位置抓牌
  public OnPack_PosGetCard(serverPack) {
		console.log("位置抓牌 OnPack_PosGetCard", serverPack);
		let pos = serverPack["pos"];
		let normalMoCnt = serverPack["normalMoCnt"];
		let gangMoCnt = serverPack["gangMoCnt"];
		let setPos = serverPack["set_Pos"];
		let opType = serverPack["opType"];
		let fanCard = serverPack["fanCard"];
		let roomSet = this.Room.GetRoomSet();
		let oldNormalMoCnt = roomSet.GetRoomSetProperty("normalMoCnt");
		let oldGangMoCnt = roomSet.GetRoomSetProperty("gangMoCnt");
		let isNormal = true;
		if (normalMoCnt > oldNormalMoCnt) {
			isNormal = true;
		} else if (gangMoCnt > oldGangMoCnt) {
			isNormal = false;
		} else {
			console.error("OnPack_PosGetCard(%s,%s) old(%s,%s)", normalMoCnt, gangMoCnt, oldNormalMoCnt, oldGangMoCnt);
		}
		if (roomSet.OnPosGetCard(pos, setPos, normalMoCnt, gangMoCnt)) {
			serverPack["isNormal"] = isNormal;
			this.Room.UpdataInfo(serverPack);
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_PosGetCard", serverPack);
		} else {
			console.error("OnPack_PosGetCard:", serverPack);
		}
  }
	//位置翻牌
  public OnPack_PosFanPai(serverPack) {
		console.log("位置翻牌 OnPack_PosFanPai", serverPack);
		if (!serverPack) {
			serverPack = {
				pos: Math.floor(Math.random() * 2),
				cardID: Math.floor(Math.random() * 13) + 1,
			}
		}
		let pos = serverPack["pos"];
		let cardID = serverPack["cardID"];
		if (this.Room.FanPaiUpdateOutCard(serverPack)) {
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_FanPai", serverPack);
		} else {
			console.error("没有位置翻牌");
		}
  }
	//位置偷牌
  public OnPack_PosTouPai(serverPack) {
		console.log("位置偷牌 OnPack_PosTouPai", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_TouPai", serverPack);
  }

	//位置执行动作通知
  public OnPack_PosOpCard(serverPack) {
		console.log("位置执行动作通知 OnPack_PosOpCard", serverPack);
		if (this.Room.UpdataInfo(serverPack)) {
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_PosOpCard", serverPack);
		} else {
			console.error("OnPack_PosOpCard serverPack:", serverPack);
		}
  }
	//位置飘
  public OnPack_PosOpPiao(serverPack) {
		console.log("位置飘 OnPack_PosOpPiao", serverPack);
		if (!serverPack) {
			serverPack = {
				pos: Math.floor(Math.random() * 2),
				value: Math.floor(Math.random() * 13) + 1,
			}
		}
		let pos = serverPack["pos"];
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_Piao", serverPack);
  }
	//更新用户手牌
  public OnPack_SetPosCard(serverPack) {
		console.log("更新用户手牌 OnPack_SetPosCard", serverPack);
		let setPosList = serverPack["setPosList"];
		this.Room.GetRoomSet().InitSetPosList(setPosList);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SetPosCard", serverPack);
  }
  public OnPack_ChatMessage(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ChatMessage", serverPack);
  }
	//竞技点不足时通知
  public OnPack_ClubCentNotEnough(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ClubCentNotEnough", serverPack);
  }
  public OnPack_ClubCentEnough(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ClubCentEnough", serverPack);
  }
	//玩家的竞技点在游戏外被改变通知
  public OnPack_ClubCentChange(serverPack) {
		console.log("玩家的竞技点在游戏外被改变通知", serverPack);
		this.Room.OnClubCentChange(serverPack);
		if (this.enterRoomID > 0) {
			this.app[this.app.subGameName + "Client"].OnEvent("RoomClubCentChange", serverPack);
		} else {
			this.app[this.app.subGameName + "Client"].OnEvent("ReadyRoomClubCentChange", serverPack);
		}
  }
	//房间开始
  public OnPack_RoomStart(serverPack) {
		console.log("房间开始 OnPack_RoomStart", serverPack);
		console.error("OnPack_RoomStart:", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomStart", {});
  }

	//获取对局记录信息
  public OnPack_RoomRecord(serverPack) {
		console.log("获取对局记录信息 OnPack_RoomRecord", serverPack);
		let records = serverPack["records"];
		let everyGameKeys = Object.keys(records);
		for (let i = 0; i < everyGameKeys.length; i++) {
			let everyGame = records[everyGameKeys[i]];
			let posHuList = everyGame["posResultList"];
			let posHuListKeys = Object.keys(posHuList);
			for (let j = 0; j < posHuListKeys.length; j++) {
				let player = posHuList[posHuListKeys[j]];
				let huType = player["huType"];
				player["huType"] = this.ShareDefine.HuTypeStringDict[huType];
			}
		}

		this.Room.RoomRecord(records);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomRecord", records);
  }
	//收到玩家打赏
  public OnPack_Reward(serverPack) {
		console.log("收到玩家打赏 OnPack_Reward", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("Reward", serverPack);
  }


  public OnPack_CardReadyChg(serverPack) {
		console.log("OnPack_CardReadyChg", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_EVT_Card_Ready");
  }
	//游戏状态改变
  public Event_ChangeStatus(serverPack) {
		console.log("游戏状态改变 AYDSS_ChangeStatus", serverPack);
		this.Room.OnChangeStatus();
		let roomPosInfoList = serverPack["setPosList"];
		for (let i = 0; i < roomPosInfoList.length; i++) {
			let roomPosInfo = roomPosInfoList[i];
			roomPosInfo["pos"] = roomPosInfo["posID"];
		}
		this.Room.GetRoomPosMgr().OnInitRoomPosData(roomPosInfoList);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_ChangeStatus", serverPack);
  }

	//---------------------获取接口------------------------------
  public GetEnterRoomID() {
		return this.enterRoomID;
  }
  public GetEnterClubID() {
		return this.clubId;
  }
  public GetEnterUnionID() {
		return this.unionId;
  }

  public GetEnterRoom() {
		if (!this.enterRoomID) {
			console.error("GetEnterRoom not enterRoom");
			return;
		}
		return this.Room;
  }

	//删除打出的卡牌
  public DeleteOutCard(cardID) {
		let findPos = this.Room.OnDeleteOutCard(cardID);
		//如果找到需要删除的卡牌
		if (findPos != -1) {
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_DeleteOutCard", {"pos": findPos});
		}
  }

	//-----------------------发包函数-----------------------------


	//登录获取当前进入的房间ID
  public SendGetCurRoomID() {
		this.NetManager.requestV2("game.C1101GetRoomID", {});
  }

	//发送创建房间
  public SendCreateRoom(sendPack) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "CreateRoom", sendPack, (data) => {
			console.log(data);
		}, (error) => {
			this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg(error["Msg"]);
		});
  }
	//获取房间信息
  public SendGetRoomInfo(roomID, callback) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "GetRoomInfo", {"roomID": roomID}, callback);
  }

	//开始游戏
  public SendStartRoomGame(roomID) {
		console.log('SendStartRoomGame roomID', roomID);
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "StartGame", {"roomID": roomID});
  }

	//发送继续游戏
  public SendContinueGame(roomID) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "ContinueGame", {"roomID": roomID});
  }
	//发送位置执行指令
  public SendPosAction(cardID, opType) {
		if (!this.enterRoomID) {
			console.error("SendPosAction not enterRoomID");
			return;
		}
		let roomID = this.enterRoomID;

		let roomSet = this.GetEnterRoom().GetRoomSet();
		if (!roomSet) {
			console.error("SendPosAction not find roomSet");
			return;
		}
		let setID = roomSet.GetRoomSetProperty("setID");
		let setRound = roomSet.GetRoomSetProperty("setRound");
		if (!setRound) {
			console.error("SendPosAction not find setRound");
			return;
		}
		let roundID = setRound["waitID"];
		let sendPack = {
			"roomID": roomID,
			"setID": setID,
			"roundID": roundID,
			"cardID": cardID,
			"opType": opType,
		};
		if (opType == 6) {
			sendPack = {
				"roomID": roomID,
				"setID": setID,
				"roundID": roundID,
				"chiList": cardID,
				"opType": opType,
			};
		}
		if (opType == 99) {
			sendPack = {
				"roomID": roomID,
				"setID": setID,
				"roundID": roundID,
				"baoJiaoList": cardID,
				"opType": opType,
			};
		}
		console.log("发送位置执行指令", sendPack);
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "OpCard", sendPack, (data) => {
			console.log(data);
		}, (error) => {
			// this.app[this.app.subGameName + "_SysNotifyManager"]().ShowSysMsg(error);
			console.log(error);
		});
		if (opType == 7) {
			this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "Play").Pre_OutCard(cardID);
		}
  }
	//退出房间
  public SendExitRoom(roomID, pos) {
		this.NetManager.requestV2("room.CBaseExitRoom", {"roomID": roomID, "posIndex": pos});
  }

	//请求对局记录封包
  public SendRoomRecord(roomID) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "RoomRecord", {"roomID": roomID});
  }
	//请求飘分封包
  public SendPiao(piao) {
		let roomID = this.enterRoomID;
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "OpPiao", {
			"roomID": roomID,
			"value": piao
		});
  }
}
