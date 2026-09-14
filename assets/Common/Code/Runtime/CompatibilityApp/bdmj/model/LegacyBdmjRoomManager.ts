// @ts-nocheck
// Generated from the Creator 2.2.2 BDMJ room model; method bodies and protocol semantics are preserved.
export type LegacyBdmjAppContext = Record<string, any>;
export class LegacyBdmjRoomManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyBdmjAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = "BDMJRoomMgr";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName+"_ShareDefine"]();
		this.NetManager = this.app[this.app.subGameName+"_NetManager"]();
		this.FormManager = this.app[this.app.subGameName+"_FormManager"]();
		this.SysNotifyManager = this.app[this.app.subGameName+"_SysNotifyManager"]();

		this.BDMJRoom = this.app.BDMJRoom();
		this.BDMJRoomSet = this.app.BDMJRoomSet();
		this.BDMJRoomPosMgr = this.app.BDMJRoomPosMgr();
		this.LocalDataManager = this.app.LocalDataManager();
		this.NetManager.RegNetPack("bdmj.CBDMJCreateRoom", this.OnPack_CreateRoom, this);
		this.NetManager.RegNetPack("bdmj.CBDMJGetRoomInfo", this.OnPack_GetRoomInfo, this);
		this.NetManager.RegNetPack("bdmj.CBDMJRoomRecord", this.OnPack_RoomRecord, this);

		this.NetManager.RegNetPack("SBDMJ_CardReadyChg", this.OnPack_CardReadyChg, this);

		this.NetManager.RegNetPack("SBDMJ_SetStart", this.OnPack_SetStart, this);
		this.NetManager.RegNetPack("SBDMJ_SetEnd", this.OnPack_SetEnd, this);

		this.NetManager.RegNetPack("SBDMJ_StartRound", this.OnPack_StartRound, this);
		this.NetManager.RegNetPack("SBDMJ_Jin", this.OnPack_Jin, this);
		this.NetManager.RegNetPack("SBDMJ_PosGetCard", this.OnPack_PosGetCard, this);
		this.NetManager.RegNetPack("SBDMJ_PosOpCard", this.OnPack_PosOpCard, this);

		this.NetManager.RegNetPack("SBDMJ_RoomEnd", this.OnPack_RoomEnd, this);
		this.NetManager.RegNetPack("SBDMJ_RoomStart", this.OnPack_RoomStart, this);
		this.NetManager.RegNetPack("SBDMJ_reward", this.OnPack_Reward, this);
		this.NetManager.RegNetPack("SBDMJ_Applique", this.OnPack_Applique, this);
		this.NetManager.RegNetPack("SBDMJ_SQOpCard", this.OnPack_SQOpCard, this);
		this.NetManager.RegNetPack("SBDMJ_SetPosCard", this.OnPack_SetPosCard, this);

		this.NetManager.RegNetPack("SBDMJ_Promptly", this.OnPack_Promptly, this);

		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_ChangeStatus", this.OnPack_ChangeStatus, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_Chatmessage", this.OnPack_ChatMessage, this);

		//俱乐部积分通知
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_ClubCentNotEnough", this.OnPack_ClubCentNotEnough, this);
		this.NetManager.RegNetPack("S"+this.app.subGameName.toUpperCase()+"_ClubCentEnough", this.OnPack_ClubCentEnough, this);
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

		this.BDMJRoom.OnReload();
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
			this.app[this.app.subGameName+"_FormManager"]().ShowForm('UIDaiKai');
			this.app[this.app.subGameName+"_FormManager"]().CloseForm('UICreatRoom');
		} else {
			this.SendGetRoomInfo(serverPack.roomID);
		}
  }

	//获取到房间完整信息
  public OnPack_GetRoomInfo(serverPack) {

		if (serverPack["NotFind_Player"]) {
			this.app[this.app.subGameName+"_SysNotifyManager"]().ShowSysMsg('PLAYER_NOT_ROOM');
			this.app[this.app.subGameName + "Client"].ExitGame();
			return;
		}
		else if (serverPack["NotFind_Room"]) {
			this.app[this.app.subGameName+"_SysNotifyManager"]().ShowSysMsg('Room_NotFindRoom');
			this.app[this.app.subGameName + "Client"].ExitGame();
			return;
		}


		this.enterRoomID = serverPack["roomID"];
		this.clubId = serverPack["cfg"]["clubId"];
		this.unionId = serverPack["cfg"]["unionId"];
		this.BDMJRoom.OnInitRoomData(serverPack);
		console.log("获取到房间完整信息 OnPack_GetRoomInfo", serverPack);
		console.log("获取到房间cfg完整信息 cfg", JSON.stringify(serverPack["cfg"]));
		//进入打牌场景
		// this.app[this.app.subGameName+"_SceneManager"]().LoadScene("bdmjScene");

		//进入打牌场景
		if (this.app[this.app.subGameName + "_SceneManager"]().GetSceneType()!="bdmjScene") {
			this.app[this.app.subGameName + "_SceneManager"]().LoadScene("bdmjScene");
		}else{
			let lastIs3DShow = this.app.LocalDataManager().GetConfigProperty("SysSetting", this.app.subGameName+"_is3DShow");
			if (lastIs3DShow == 0) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm('game/BDMJ/ui/UIBDMJ2DPlay');
			}else if (lastIs3DShow == 1) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm('game/BDMJ/ui/UIBDMJPlay');
			}else if (lastIs3DShow == 2) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm('game/BDMJ/ui/UIBDMJKXPlay');
			}else if (lastIs3DShow == 3) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm('game/BDMJ/ui/UIBDMJZZPlay');
			}else if (lastIs3DShow == 4) {
				this.app[this.app.subGameName + "_FormManager"]().ShowForm('game/BDMJ/ui/UIBDMJJXPlay');
			}
		}
  }
	//--------------notify-----------------


	//set开始
  public OnPack_SetStart(serverPack) {
		console.log("set开始 OnPack_SetStart", serverPack);
		let roomID = serverPack["roomID"];
		let setInfo = serverPack["setInfo"];
		this.BDMJRoom.OnSetStart(setInfo);
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_SetStart", serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("SetStart", serverPack);
  }

	//set结束
  public OnPack_SetEnd(serverPack) {
		console.log("set结束 OnPack_SetEnd", serverPack);
		let roomID = serverPack["roomID"];
		let setEnd = serverPack["setEnd"];
		this.BDMJRoom.OnSetEnd(setEnd);
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_SetEnd", serverPack);
  }

	//开金
  public OnPack_Jin(serverPack) {
		console.log("开金 OnPack_Jin", serverPack);
		let roomID = serverPack["roomID"];
		let jin = serverPack["jin"];
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_Jin", serverPack);
  }

	//round开始
  public OnPack_StartRound(serverPack) {
		console.log("round开始 OnPack_StartRound", serverPack);
		let roomID = serverPack["roomID"];
		let setRound = serverPack["room_SetWait"];
		this.BDMJRoom.GetRoomSet().OnStartRound(setRound);
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_StartRound", serverPack);
  }

	//位置抓牌
  public OnPack_PosGetCard(serverPack) {
		console.log("位置抓牌 OnPack_PosGetCard", serverPack);
		let roomID = serverPack["roomID"];
		let pos = serverPack["pos"];
		let normalMoCnt = serverPack["normalMoCnt"];
		let gangMoCnt = serverPack["gangMoCnt"];
		let setPos = serverPack["set_Pos"];
		let roomSet = this.BDMJRoom.GetRoomSet();
		let oldNormalMoCnt = roomSet.GetRoomSetProperty("normalMoCnt");
		let oldGangMoCnt = roomSet.GetRoomSetProperty("gangMoCnt");
		let isNormal = true;
		if (normalMoCnt > oldNormalMoCnt) {
			isNormal = true;
		} else if (gangMoCnt > oldGangMoCnt) {
			isNormal = false;
		} else {
			this.ErrLog("OnPack_PosGetCard(%s,%s) old(%s,%s)", normalMoCnt, gangMoCnt, oldNormalMoCnt, oldGangMoCnt);
		}
		if (roomSet.OnPosGetCard(pos, setPos, normalMoCnt, gangMoCnt)) {
			serverPack["isNormal"] = isNormal;
			this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_PosGetCard", serverPack);
		} else {
			this.ErrLog("OnPack_PosGetCard:", serverPack);
		}

  }

	//位置执行动作通知
  public OnPack_PosOpCard(serverPack) {
		console.log("位置执行动作通知 OnPack_PosOpCard", serverPack);
		let roomID = serverPack["roomID"];
		if (this.BDMJRoom.UpdataInfo(serverPack)) {
			this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_PosOpCard", serverPack);
		} else {
			this.ErrLog("OnPack_PosOpCard serverPack:", serverPack);
		}
  }
	//更新玩家分数
  public OnPack_Promptly(serverPack) {
		console.log("更新玩家分数 OnPack_Promptly", serverPack);
		let roomID = serverPack["roomID"];
		let setPosList = serverPack["playerPosInfoList"];
		this.BDMJRoomPosMgr.UpdatePoint(setPosList);
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_Promptly", serverPack);
  }
  public OnPack_ChangeStatus(serverPack) {
		this[this.app.subGameName.toUpperCase()+"Room"].OnSetWaiting(serverPack);
		let roomSet = this[this.app.subGameName.toUpperCase()+"Room"].GetRoomSet();
		let state = this.ShareDefine.SetStateStringDict[serverPack["state"]];
		roomSet.SetState(state);
		let dPos = serverPack.dPos;
		roomSet.UpdateDPos(dPos);
		this.app[this.app.subGameName + "Client"].OnEvent(this.app.subGameName.toUpperCase()+"_ChangeStatus", serverPack);
  }
  public OnPack_ChatMessage(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("ChatMessage", serverPack);
  }
	//更新用户手牌
  public OnPack_SetPosCard(serverPack) {
		console.log("更新用户手牌 OnPack_SetPosCard", serverPack);
		let roomID = serverPack["roomID"];
		let setPosList = serverPack["setPosList"];
		this.BDMJRoomSet.InitSetPosList(setPosList);
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_SetPosCard", serverPack);
  }

	//位置补花
  public OnPack_Applique(serverPack) {
		console.log("位置补花 OnPack_Applique", serverPack);
		let roomID = serverPack["roomID"];
		if (this.BDMJRoom.UpdataInfo(serverPack)) {
			this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_Applique", serverPack);
		} else {
			this.ErrLog("OnPack_Applique serverPack:", serverPack);
		}
  }

	//抢金三金倒
  public OnPack_SQOpCard(serverPack) {
		console.log("抢金三金倒 OnPack_SQOpCard", serverPack);
		let roomID = serverPack["roomID"];
		let setRound = serverPack["room_SetWait"];
		this.BDMJRoom.GetRoomSet().OnStartRound(setRound);
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_SQOpCard", serverPack);
  }

	//房间开始
  public OnPack_RoomStart(serverPack) {
		console.log("房间开始 OnPack_RoomStart", serverPack);
		this.ErrLog("OnPack_RoomStart:", serverPack);
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
	//房间结束
  public OnPack_RoomEnd(serverPack) {
		console.log("房间结束 OnPack_RoomEnd", serverPack);
		this.BDMJRoom.OnRoomEnd(serverPack);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomEnd", serverPack);
  }

	//获取对局记录信息
  public OnPack_RoomRecord(serverPack) {
		console.log("获取对局记录信息 OnPack_RoomRecord", serverPack);
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

		this.BDMJRoom.RoomRecord(records);
		this.app[this.app.subGameName + "Client"].OnEvent("RoomRecord", records);
  }
	//收到玩家打赏
  public OnPack_Reward(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("Reward", serverPack);
  }


  public OnPack_CardReadyChg(serverPack) {
		this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_EVT_Card_Ready");

  }


	//---------------------获取接口------------------------------
  public GetEnterRoomID() {
		return this.enterRoomID;
  }

  public GetEnterRoom() {
		if (!this.enterRoomID) {
			this.ErrLog("GetEnterRoom not enterRoom");
			return;
		}
		return this.BDMJRoom;
  }

	//删除打出的卡牌
  public DeleteOutCard(cardID) {
		let findPos = this.BDMJRoom.OnDeleteOutCard(cardID);
		//如果找到需要删除的卡牌
		if (findPos != -1) {
			this.app[this.app.subGameName + "Client"].OnEvent("BDMJ_DeleteOutCard", {"pos": findPos});
		}
  }

	//-----------------------发包函数-----------------------------


	//登录获取当前进入的房间ID
  public SendGetCurRoomID() {
		console.log("登陆获取当前进入的房间ID SendGetCurRoomID");
		this.NetManager.requestV2("game.C1101GetRoomID", {});
  }

	//发送创建房间
  public SendCreateRoom(sendPack) {
		console.log("发送创建房间 SendCreateRoom", sendPack);
		this.NetManager.requestV2("bdmj.CBDMJCreateRoom", sendPack);
  }
	//获取房间信息
  public SendGetRoomInfo(roomID, callback) {
		console.log("获取房间信息 SendGetRoomInfo", roomID, callback);
		this.NetManager.requestV2("bdmj.CBDMJGetRoomInfo", {"roomID": roomID}, function (success) {

		}, function (error) {
			this.app[this.app.subGameName+"_SysNotifyManager"]().ShowSysMsg('Room_NotFindRoom');
			this.app[this.app.subGameName + "Client"].ExitGame();
		});
  }

	//开始游戏
  public SendStartRoomGame(roomID) {
		console.log("开始游戏 SendStartRoomGame", roomID);
		this.NetManager.requestV2("room.CBaseStartGame", {"roomID": roomID});
  }

	//发送继续游戏
  public SendContinueGame(roomID) {
		console.log("发送继续游戏 SendContinueGame", roomID);
		this.NetManager.requestV2("room.CBaseContinueGame", {"roomID": roomID});
  }


	//发送位置执行指令
  public SendPosAction(cardID, opType) {
		console.log("发送位置执行指令 SendPosAction", cardID, opType);
		if (!this.enterRoomID) {
			this.ErrLog("SendPosAction not enterRoomID");
			return;
		}
		let roomID = this.enterRoomID;

		let roomSet = this.GetEnterRoom().GetRoomSet();
		if (!roomSet) {
			this.ErrLog("SendPosAction not find roomSet");
			return;
		}
		let setID = roomSet.GetRoomSetProperty("setID");
		let setRound = roomSet.GetRoomSetProperty("setRound");
		if (!setRound) {
			this.ErrLog("SendPosAction not find setRound");
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
		this.NetManager.requestV2("BDMJ.CBDMJOpCard", sendPack);
		let is3DShow = this.LocalDataManager.GetConfigProperty("SysSetting", this.app.subGameName + "_is3DShow");
		if (opType == this.ShareDefine.OpType_Out) {
			if (is3DShow == 1) {
				this.FormManager.GetFormComponentByFormName("game/BDMJ/ui/UIBDMJPlay").Pre_OutCard(cardID);
			} else if (is3DShow == 2) {
				this.FormManager.GetFormComponentByFormName("game/BDMJ/ui/UIBDMJKXPlay").Pre_OutCard(cardID);
			} else if (is3DShow == 0) {
				this.FormManager.GetFormComponentByFormName("game/BDMJ/ui/UIBDMJ2DPlay").Pre_OutCard(cardID);
			} else if (is3DShow == 3) {
				this.FormManager.GetFormComponentByFormName("game/BDMJ/ui/UIBDMJZZPlay").Pre_OutCard(cardID);
			} else if (is3DShow == 4) {
				this.FormManager.GetFormComponentByFormName("game/BDMJ/ui/UIBDMJJXPlay").Pre_OutCard(cardID);
			} 
		}
  }
	//不抢金不三金倒
  public SendSqPass(cardID, opType) {
		console.log("不抢金不三金倒 SendSqPass", cardID, opType);
		if (!this.enterRoomID) {
			this.ErrLog("SendSqPass not enterRoomID");
			return
		}
		let roomID = this.enterRoomID;

		let roomSet = this.GetEnterRoom().GetRoomSet();
		if (!roomSet) {
			this.ErrLog("SendSqPass not find roomSet");
			return
		}
		let setID = roomSet.GetRoomSetProperty("setID");
		let setRound = roomSet.GetRoomSetProperty("setRound");
		if (!setRound) {
			this.ErrLog("SendSqPass not find setRound");
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
		this.NetManager.requestV2("BDMJ.CBDMJSQOpCard", sendPack);
  }
	//退出房间
  public SendExitRoom(roomID, pos) {
		console.log("退出房间 SendExitRoom", roomID, pos);
		this.NetManager.requestV2("room.C"+this.app.subGameName.toUpperCase()+"ExitRoom", {"roomID": roomID, "posIndex": pos});
  }

	//请求对局记录封包
  public SendRoomRecord(roomID) {
		console.log("请求对局记录封包 SendPosAction", roomID);
		this.NetManager.requestV2("BDMJ.CBDMJRoomRecord", {"roomID": roomID});
  }
}
