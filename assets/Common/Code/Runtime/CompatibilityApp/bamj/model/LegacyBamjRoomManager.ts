// @ts-nocheck
// Generated from the Creator 2.2.2 BAMJ room model; method bodies and protocol semantics are preserved.
export type LegacyBamjAppContext = Record<string, any>;
export class LegacyBamjRoomManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyBamjAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app["subGameName"] + "RoomMgr";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.NetManager = this.app[this.app.subGameName + "_NetManager"]();
		this.FormManager = this.app[this.app.subGameName + "_FormManager"]();
		this.SysNotifyManager = this.app[this.app.subGameName + "_SysNotifyManager"]();
		this.LocalDataManager = this.app.LocalDataManager();

		this[this.app.subGameName.toUpperCase() + "Room"] = this.app[this.app.subGameName.toUpperCase() + "Room"]();
		this[this.app.subGameName.toUpperCase() + "RoomSet"] = this.app[this.app.subGameName.toUpperCase() + "RoomSet"]();
		this[this.app.subGameName.toUpperCase() + "RoomPosMgr"] = this.app[this.app.subGameName.toUpperCase() + "RoomPosMgr"]();

		this.NetManager.RegNetPack(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "CreateRoom", this.OnPack_CreateRoom, this);
		this.NetManager.RegNetPack(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "GetRoomInfo", this.OnPack_GetRoomInfo, this);
		this.NetManager.RegNetPack(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "RoomRecord", this.OnPack_RoomRecord, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_CardReadyChg", this.OnPack_CardReadyChg, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SetStart", this.OnPack_SetStart, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SetEnd", this.OnPack_SetEnd, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_StartRound", this.OnPack_StartRound, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_Jin", this.OnPack_Jin, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_PosGetCard", this.OnPack_PosGetCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_PosOpCard", this.OnPack_PosOpCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_Promptly", this.OnPack_Promptly, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_RoomEnd", this.OnPack_RoomEnd, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_RoomStart", this.OnPack_RoomStart, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_reward", this.OnPack_Reward, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_Applique", this.OnPack_Applique, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SQOpCard", this.OnPack_SQOpCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_SetPosCard", this.OnPack_SetPosCard, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_Chatmessage", this.OnPack_ChatMessage, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_ChangeStatus", this.OnPack_ChangeStatus, this);

		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_PiaoMai", this.OnPack_PiaoMai, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_PaoFen", this.OnPack_PaoFen, this);

		//俱乐部积分通知
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_ClubCentNotEnough", this.OnPack_ClubCentNotEnough, this);
		this.NetManager.RegNetPack("S" + this.app.subGameName.toUpperCase() + "_ClubCentEnough", this.OnPack_ClubCentEnough, this);
		this.NetManager.RegNetPack("SRoom_ClubCentChange", this.OnPack_ClubCentChange, this);

		this.HeroManager = this.app[this.app.subGameName + "_HeroManager"]();

		this.OnReload();

		console.log("Init");

  }

	/**
	 * 重登
	 */
  public OnReload() {
		this.enterRoomID = 0;
		//获取启动客户端进入的房间KEY
		console.loginEnterRoomKey = 0;

		this[this.app.subGameName.toUpperCase() + "Room"].OnReload();
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
		let agrs = Object.keys(serverPack);
		if (0 == agrs.length)//俱乐部会回空包
			return;
		if (serverPack.createType == 2) {
			this.app.FormManager().ShowForm('UIDaiKai');
			this.app.FormManager().CloseForm('UICreatRoom');
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
		this[this.app.subGameName.toUpperCase() + "Room"].OnInitRoomData(serverPack);
		//进入打牌场景
		if (this.app[this.app.subGameName + "_SceneManager"]().GetSceneType() != this.app.subGameName + "Scene") {
			this.app[this.app.subGameName + "_SceneManager"]().LoadScene(this.app.subGameName + "Scene");
		} else {
			let lastIs3DShow = this.app.LocalDataManager().GetConfigProperty("SysSetting", this.app.subGameName + "_is3DShow");
			if (lastIs3DShow == 0) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "2DPlay");
			} else if (lastIs3DShow == 2) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "XYPlay");
			} else if (lastIs3DShow == 3) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "WZPlay");
			} else if (lastIs3DShow == 4) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "JPPlay");
			} else if (lastIs3DShow == 5) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "YFPlay");
			} else if (lastIs3DShow == 6) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "WLPlay");
			} else if (lastIs3DShow == 7) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "HJPlay");
			}
		}
  }
	//--------------notify-----------------


	//set开始
  public OnPack_SetStart(serverPack) {
		console.log("set开始 OnPack_SetStart", serverPack);
		let roomID = serverPack["roomID"];
		let setInfo = serverPack["setInfo"];
		this[this.app.subGameName.toUpperCase() + "Room"].OnSetStart(setInfo);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SetStart", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("SetStart", serverPack);
  }


	//set结束
  public OnPack_SetEnd(serverPack) {
		console.log("set结束 OnPack_SetEnd", serverPack);
		let roomID = serverPack["roomID"];
		let setEnd = serverPack["setEnd"];
		this[this.app.subGameName.toUpperCase() + "Room"].OnSetEnd(setEnd);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SetEnd", serverPack);
  }

	//开金
  public OnPack_Jin(serverPack) {
		console.log("开金 OnPack_Jin", serverPack);
		let roomID = serverPack["roomID"];
		let jin = serverPack["jin"];
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_Jin", serverPack);
  }

	//round开始
  public OnPack_StartRound(serverPack) {
		console.log("round开始 OnPack_StartRound", serverPack);
		let roomID = serverPack["roomID"];
		let setRound = serverPack["room_SetWait"];
		this[this.app.subGameName.toUpperCase() + "Room"].GetRoomSet().OnStartRound(setRound);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_StartRound", serverPack);
  }

	//位置抓牌
  public OnPack_PosGetCard(serverPack) {
		let roomID = serverPack["roomID"];
		let pos = serverPack["pos"];
		let normalMoCnt = serverPack["normalMoCnt"];
		let gangMoCnt = serverPack["gangMoCnt"];
		let cardRestSize = serverPack["cardRestSize"];
		let setPos = serverPack["set_Pos"];
		let roomSet = this[this.app.subGameName.toUpperCase() + "Room"].GetRoomSet();
		let oldNormalMoCnt = roomSet.GetRoomSetProperty("normalMoCnt");
		let oldGangMoCnt = roomSet.GetRoomSetProperty("gangMoCnt");
		let isNormal = true;
		if (normalMoCnt > oldNormalMoCnt) {
			isNormal = true;
		}
		else if (gangMoCnt > oldGangMoCnt) {
			isNormal = false;
		} else {
			console.error("OnPack_PosGetCard(%s,%s) old(%s,%s)", normalMoCnt, gangMoCnt, oldNormalMoCnt, oldGangMoCnt);
		}
		if (roomSet.OnPosGetCard(pos, setPos, normalMoCnt, gangMoCnt, cardRestSize)) {
			serverPack["isNormal"] = isNormal;
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_PosGetCard", serverPack);
		}
		else {
			console.error("OnPack_PosGetCard:", serverPack);
		}

  }

	//更新玩家分数
  public OnPack_Promptly(serverPack) {
		console.log("更新玩家分数 OnPack_Promptly", serverPack);
		let roomID = serverPack["roomID"];
		let setPosList = serverPack["playerPosInfoList"];
		this[this.app.subGameName.toUpperCase() + "RoomPosMgr"].UpdatePoint(setPosList);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_Promptly", serverPack);
  }
	//位置执行动作通知
  public OnPack_PosOpCard(serverPack) {
		let roomID = serverPack["roomID"];
		if (this[this.app.subGameName.toUpperCase() + "Room"].UpdataInfo(serverPack)) {
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_PosOpCard", serverPack);
		}
		else {
			console.error("OnPack_PosOpCard serverPack:", serverPack);
		}
  }
	//更新用户手牌
  public OnPack_SetPosCard(serverPack) {
		let roomID = serverPack["roomID"];
		let setPosList = serverPack["setPosList"];
		this[this.app.subGameName.toUpperCase() + "RoomSet"].InitSetPosList(setPosList);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SetPosCard", serverPack);
  }

  public OnPack_ChangeStatus(serverPack) {
		console.log("状态改变 OnPack_ChangeStatus", serverPack);
		this[this.app.subGameName.toUpperCase() + "Room"].OnSetWaiting(serverPack);
		let roomSet = this[this.app.subGameName.toUpperCase() + "Room"].GetRoomSet();
		let state = this.ShareDefine.SetStateStringDict[serverPack["state"]];
		roomSet.SetState(state);
		// let dPos = serverPack.dPos;
		// let piaoHuaList = serverPack.piaoHuaList;
		// roomSet.UpdateDPos(dPos);
		// roomSet.SetPiaoHua(piaoHuaList);//更新飘花初始
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_ChangeStatus", serverPack);
  }
	//局内消息表情
  public OnPack_ChatMessage(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ChatMessage", serverPack);
  }
	//有玩家买马或双股通知
  public OnPack_PiaoMai(serverPack) {
		console.log("有玩家买马或双股通知 OnPack_PiaoMai", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_PiaoMai", serverPack);
  }
  public OnPack_PaoFen(serverPack) {
		console.log("跑分 OnPack_PaoFen", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_PaoFen", serverPack);
  }
	//位置补花
  public OnPack_Applique(serverPack) {
		let roomID = serverPack["roomID"];
		if (this[this.app.subGameName.toUpperCase() + "Room"].UpdataInfo(serverPack)) {
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_Applique", serverPack);
		}
		else {
			console.error("OnPack_Applique serverPack:", serverPack);
		}
  }

	//抢金三金倒
  public OnPack_SQOpCard(serverPack) {
		let roomID = serverPack["roomID"];
		let setRound = serverPack["room_SetWait"];
		this[this.app.subGameName.toUpperCase() + "Room"].GetRoomSet().OnStartRound(setRound);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_SQOpCard", serverPack);
  }

	//房间开始
  public OnPack_RoomStart(serverPack) {
		console.error("OnPack_RoomStart:", serverPack);
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
		this[this.app.subGameName.toUpperCase() + "Room"].OnClubCentChange(serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomClubCentChange", serverPack);
  }
	//房间结束
  public OnPack_RoomEnd(serverPack) {
		this[this.app.subGameName.toUpperCase() + "Room"].OnRoomEnd(serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomEnd", serverPack);
  }

	//获取对局记录信息
  public OnPack_RoomRecord(serverPack) {
		let records = serverPack["records"];
		let everyGameKeys = Object.keys(records);
		for (let i = 0; i < everyGameKeys.length; i++) {
			let everyGame = records[everyGameKeys[i]];
			let posResultList = everyGame["posResultList"];
			let posResultListKeys = Object.keys(posResultList);
			for (let j = 0; j < posResultListKeys.length; j++) {
				let player = posResultList[posResultListKeys[j]];
				let huType = player["huType"];
				player["huType"] = this.ShareDefine.HuTypeStringDict[huType];
			}
		}

		this[this.app.subGameName.toUpperCase() + "Room"].RoomRecord(records);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomRecord", records);
  }
	//收到玩家打赏
  public OnPack_Reward(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("Reward", serverPack);
  }


  public OnPack_CardReadyChg(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_EVT_Card_Ready");
  }


	//---------------------获取接口------------------------------
  public GetEnterRoomID() {
		return this.enterRoomID
  }

  public GetEnterRoom() {
		if (!this.enterRoomID) {
			console.error("GetEnterRoom not enterRoom");
			return
		}
		return this[this.app.subGameName.toUpperCase() + "Room"]
  }

	//删除打出的卡牌
  public DeleteOutCard(cardID) {
		let findPos = this[this.app.subGameName.toUpperCase() + "Room"].OnDeleteOutCard(cardID);
		//如果找到需要删除的卡牌
		if (findPos != -1) {
			this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase() + "_DeleteOutCard", { "pos": findPos });
		}
  }

	//-----------------------发包函数-----------------------------


	//登录获取当前进入的房间ID
  public SendGetCurRoomID() {
		this.NetManager.requestV2("game.C1101GetRoomID", {});
  }

	//发送创建房间
  public SendCreateRoom(sendPack) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "CreateRoom", sendPack, function (success) {
			console.log("创建房间成功", success);
		}, function (error) {
			console.log("创建房间失败", error, sendPack);
		});
  }
	//获取房间信息
  public SendGetRoomInfo(roomID, callback) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "GetRoomInfo", { "roomID": roomID }, callback);
  }

	//开始游戏
  public SendStartRoomGame(roomID) {
		this.NetManager.requestV2("room.CBaseStartGame", { "roomID": roomID });
  }

	//发送继续游戏
  public SendContinueGame(roomID) {
		this.NetManager.requestV2("room.CBaseContinueGame", { "roomID": roomID });
  }
	//发送等待继续游戏时间
  public SendTimeOutContinue() {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "TimeOutContinue", { "roomID": this.enterRoomID });
  }

	//发送位置执行指令
  public SendPosActionChi(cardList, opType) {
		if (!this.enterRoomID) {
			this.ErrLog("SendPosAction not enterRoomID");
			return
		}
		let roomID = this.enterRoomID;

		let roomSet = this.GetEnterRoom().GetRoomSet();
		if (!roomSet) {
			this.ErrLog("SendPosAction not find roomSet");
			return
		}
		let setID = roomSet.GetRoomSetProperty("setID");
		let setRound = roomSet.GetRoomSetProperty("setRound");
		if (!setRound) {
			this.ErrLog("SendPosAction not find setRound");
			return
		}
		let roundID = setRound["waitID"];
		let sendPack = {
			"roomID": roomID,
			"setID": setID,
			"roundID": roundID,
			"cardList": cardList,
			"cardID": cardList[0],
			"opType": opType,
		};
		this.NetManager.requestV2(this.app.subGameName.toUpperCase() + ".C" + this.app.subGameName.toUpperCase() + "OpCard", sendPack);

  }

	//发送位置执行指令
  public SendPosAction(cardID, opType, cardList = []) {
		let is3DShow = this.LocalDataManager.GetConfigProperty("SysSetting", this.app.subGameName + "_is3DShow");
		if (!this.enterRoomID) {
			console.error("SendPosAction not enterRoomID");
			return
		}
		let roomID = this.enterRoomID;

		let roomSet = this.GetEnterRoom().GetRoomSet();
		if (!roomSet) {
			console.error("SendPosAction not find roomSet");
			return
		}
		let setID = roomSet.GetRoomSetProperty("setID");
		let setRound = roomSet.GetRoomSetProperty("setRound");
		if (!setRound) {
			console.error("SendPosAction not find setRound");
			return
		}
		let roundID = setRound["waitID"];
		let sendPack = {
			"roomID": roomID,
			"setID": setID,
			"roundID": roundID,
			"cardID": cardID,
			"cardList": cardList,
			"opType": opType,
		};
		this.NetManager.requestV2(this.app.subGameName.toUpperCase() + ".C" + this.app.subGameName.toUpperCase() + "OpCard", sendPack, (data) => {
			console.log("data", data);
			if (opType == this.ShareDefine.OpType_Out || opType == this.ShareDefine.OpType_KouTing) { //打牌
				if (is3DShow == 0) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "2DPlay").Pre_OutCard(cardID);
				} else if (is3DShow == 2) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "XYPlay").Pre_OutCard(cardID);
				} else if (is3DShow == 3) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "WZPlay").Pre_OutCard(cardID);
				} else if (is3DShow == 4) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "JPPlay").Pre_OutCard(cardID);
				} else if (is3DShow == 5) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "YFPlay").Pre_OutCard(cardID);
				} else if (is3DShow == 6) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "WLPlay").Pre_OutCard(cardID);
				} else if (is3DShow == 7) {
					this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "HJPlay").Pre_OutCard(cardID);
				}
			}
		}, (error) => {
			console.log("error", error, sendPack);
		});
  }
	//不抢金不三金倒
  public SendSqPass(cardID, opType) {
		if (!this.enterRoomID) {
			console.error("SendSqPass not enterRoomID");
			return
		}
		let roomID = this.enterRoomID;

		let roomSet = this.GetEnterRoom().GetRoomSet();
		if (!roomSet) {
			console.error("SendSqPass not find roomSet");
			return
		}
		let setID = roomSet.GetRoomSetProperty("setID");
		let setRound = roomSet.GetRoomSetProperty("setRound");
		if (!setRound) {
			console.error("SendSqPass not find setRound");
			return
		}
		let roundID = setRound["waitID"];
		let sendPack = {
			"roomID": roomID,
			"setID": setID,
			"roundID": roundID,
			"cardID": cardID,
			"opType": opType,
		};
		this.NetManager.requestV2(this.app.subGameName.toUpperCase() + ".C" + this.app.subGameName.toUpperCase() + "SQOpCard", sendPack);
  }
	//退出房间
  public SendExitRoom(roomID, pos) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "ExitRoom", {
			"roomID": roomID,
			"posIndex": pos
		});
  }

	//请求对局记录封包
  public SendRoomRecord(roomID) {
		this.NetManager.requestV2(this.app.subGameName.toUpperCase() + ".C" + this.app.subGameName.toUpperCase() + "RoomRecord", { "roomID": roomID });
  }
	//飘花请求
  public SendMai(maiMa) {
		console.log("买码请求 SendPiao", maiMa);
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "MaiMa", {
			"roomID": this.enterRoomID,
			"maiMa": maiMa
		});
  }
	//飘花请求
  public SendPiao(piaoHua) {
		console.log("飘花请求 SendPiao", piaoHua);
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "PiaoHua", {
			"roomID": this.enterRoomID,
			"piaoHua": piaoHua
		});
  }

	// 买马跟双股请求
  public SendPiaoFen(piaoFen) {
		console.log("买马跟双股请求 SendPiao", piaoFen);
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "PiaoMai", {
			"roomID": this.enterRoomID,
			"piaoFen": piaoFen,
			// "shuangGu": shuangGu
		});
  }

  public GetPlayComponent() {
		let is3DShow = this.LocalDataManager.GetConfigProperty("SysSetting", this.app.subGameName + "_is3DShow");
		if (is3DShow == 0) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "2DPlay");
		} else if (is3DShow == 2) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "XYPlay");
		} else if (is3DShow == 3) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "WZPlay");
		} else if (is3DShow == 4) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "JPPlay");
		} else if (is3DShow == 5) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "YFPlay");
		} else if (is3DShow == 6) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "WLPlay");
		} else if (is3DShow == 7) {
			return this.FormManager.GetFormComponentByFormName("game/" + this.app.subGameName.toUpperCase() + "/ui/UI" + this.app.subGameName.toUpperCase() + "HJPlay");
		}
  }

	// 下跑
  public SendXiaPao(pao) {
		this.NetManager.requestV2(this.app.subGameName + ".C" + this.app.subGameName.toUpperCase() + "XiaPao", {
			"roomID": this.enterRoomID,
			"pao": pao,
		});
  }

}
