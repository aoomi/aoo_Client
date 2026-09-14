// @ts-nocheck
// Generated from the Creator 2.2.2 AYCP room model; method bodies and protocol semantics are preserved.
export type LegacyAycpAppContext = Record<string, any>;
export class LegacyAycpRoom {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAycpAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = "AYDSSRoom";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.HeroManager = this.app[this.app.subGameName + "_HeroManager"]();

		this.RoomPosMgr = this.app[this.app.subGameName.toUpperCase() + "RoomPosMgr"]();
		this.RoomSet = this.app[this.app.subGameName.toUpperCase() + "RoomSet"]();
		this.SysDataManager = this.app[this.app.subGameName + "_SysDataManager"]();

		this.PropertyInfo = this.SysDataManager.GetTableDict("PropertyInfo");

		this.OnReload();

		this.Log("Init");

  }
  public ClearDissolve() {
		this.dataInfo['dissolve'] = '';
  }
  public OnReload() {
		this.dataInfo = {};
		this.roomConfig = {};
		this.roomRecord = {};
		this.RoomPosMgr.OnReload();
		this.RoomSet.OnReload();
  }

	//-----------------------回调函数-----------------------------
	//登录初始化房间数据
  public OnInitRoomData(serverPack) {
		this.RoomMgr = this.app[this.app.subGameName.toUpperCase() + "RoomMgr"]();

		let room = this.RoomMgr.GetEnterRoom();
		serverPack["state"] = this.ShareDefine.RoomStateStringDict[serverPack["state"]];

		if (serverPack.prizeType == 'Gold') {
			this.app[this.app.subGameName + "_ShareDefine"]().isCoinRoom = true;
		} else if (serverPack.prizeType == 'RoomCard') {
			this.app[this.app.subGameName + "_ShareDefine"]().isCoinRoom = false;
		}

		let cfg = serverPack["cfg"];
		this.roomConfig = cfg;

		let roomPosInfoList = serverPack["posList"] || [];
		this.RoomPosMgr.OnInitRoomPosData(roomPosInfoList);

		let setInfo = serverPack["set"];
		this.RoomSet.OnInitRoomSetData(setInfo);
		//初始化金
		//其余信息存放到dataInfo
		this.dataInfo = serverPack;
		this.Log("roomConfig:", this.roomConfig);
		this.Log("dataInfo:", this.dataInfo);
  }

	//位置离开
  public OnPosLeave(pos) {
		this.RoomPosMgr.OnPosLeave(pos);
		this.RoomSet.OnPosLeave(pos);
  }
  public UpdateOwnerID(ownerID) {
		this.dataInfo['ownerID'] = ownerID;
  }
	/*
	*战绩兼容扑克
	 */
  public SetGameRecord(bget) {

  }
	//继续游戏
  public OnPosContinueGame(pos) {
		this.RoomPosMgr.OnPosContinueGame(pos);
		this.RoomSet.OnPosContinueGame(pos);
  }

	//set开始
  public OnSetStart(setInfo) {
		this.dataInfo["state"] = this.ShareDefine.RoomState_Playing;
		this.dataInfo["setID"] = setInfo["setID"];
		this.GetRoomSet().OnSetStart(setInfo);
		this.RoomPosMgr.OnSetSportPoint(setInfo);
  }
  public OnChangeStatus() {
		this.dataInfo["state"] = this.ShareDefine.RoomState_Playing;
		this.dataInfo["setID"] = 1;
  }
	//set结束
  public OnSetEnd(setEnd) {
		this.RoomSet.OnSetEnd(setEnd);
		this.RoomPosMgr.OnSetEnd(setEnd);
  }

	//房间结束
  public OnRoomEnd(roomEnd) {
		this.dataInfo["state"] = this.ShareDefine.RoomState_End;
		this.dataInfo["roomEnd"] = roomEnd;
  }

	//开始解散房间
  public OnStartVoteDissolve(createPos, endSec) {
		let posAgreeList = [];
		for (let index = 0; index < this.roomConfig.playerNum; index++) {
			if (index == createPos) {
				posAgreeList.push(1);
			} else {
				posAgreeList.push(0);
			}
		}
		let dissolveInfo = {"endSec": endSec, "createPos": createPos, "posAgreeList": posAgreeList};
		this.dataInfo["dissolve"] = dissolveInfo;
		return dissolveInfo;
  }

	//位置同意拒绝更新
  public OnPosDealVote(pos, agreeDissolve) {

		let dissolveInfo = this.dataInfo["dissolve"];
		let posAgreeList = dissolveInfo["posAgreeList"];
		if (!posAgreeList) {
			console.error("OnPosDealVote not find posAgreeList:", this.dataInfo);
			return
		}

		if (pos >= posAgreeList.length) {
			console.error("OnPosDealVote(%s,%s):", pos, agreeDissolve, posAgreeList);
			return
		}

		if (agreeDissolve) {
			posAgreeList[pos] = 1;
		}
		else {
			posAgreeList[pos] = 2;
		}
		return dissolveInfo
  }
	//更新房间内的对局记录信息
  public RoomRecord(serverPack) {
		this.roomRecord = {};
		this.roomRecord = serverPack;
  }
	//更新Room datainfo数据
  public UpdataInfo(serverPack) {
		this.GetRoomPosMgr().OnPosOpCard(serverPack);
		return this.GetRoomSet().OnPosOpCard(serverPack)
  }
	//翻牌更新outcard
  public FanPaiUpdateOutCard(serverPack) {
		return this.GetRoomSet().OnPosFanPai(serverPack);
  }
  public UpdateEndSec(endSec) {
		this.dataInfo["dissolve"]["endSec"] =endSec;
  }
	//---------------------设置函数---------------------
	//删除已经打出的卡牌
  public OnDeleteOutCard(cardID) {
		//如果是不是在牌局进行中
		if (this.dataInfo["state"] != this.ShareDefine.RoomState_Playing) {
			console.error("OnDeleteOutCard not AYDSSRoomState_Playing");
			return -1;
		}
		return this.GetRoomSet().OnDeleteOutCard(cardID);
  }

	//---------------------获取函数---------------------
	//获取对局记录信息
  public GetRoomRecord() {
		return this.roomRecord;
  }
	//获取房间信息
  public GetRoomDataInfo() {
		return this.dataInfo;
  }
	//获取创建房间信息b
  public GetRoomProperty(property) {
		if (!this.dataInfo.hasOwnProperty(property)) {
			console.error("GetRoomProperty not find:%s", property);
			return
		}
		return this.dataInfo[property];
  }
  public OnTotalScoreFromLogin(posList) {
		this.RoomPosMgr.onPosTotalJifen(posList);

  }
  public OnDissolve(dissolve) {
		this.dataInfo["dissolve"] = dissolve;
  }
	//获取房间配置信息
  public GetRoomConfig() {
		return this.roomConfig;
  }

	//获取房间配置信息
  public GetRoomConfigByProperty(property) {
		if (!this.roomConfig.hasOwnProperty(property)) {
			console.error("GetRoomConfigByProperty not find:%s", property);
			return;
		}
		return this.roomConfig[property];
  }

  public GetRoomSet() {
		let setID = this.dataInfo["setID"];
		if (!setID) {
			console.error("GetSet not start set");
			return;
		}
		return this.RoomSet;
  }

  public GetRoomPosMgr() {
		return this.RoomPosMgr;
  }
  public OnClubCentChange(serverPack) {
		this.RoomPosMgr.OnClubCentChange(serverPack);
  }
	//客户端玩家是否是开房人
  public IsClientIsCreater() {
		let heroID = this.HeroManager.GetHeroID();
		if (heroID == this.dataInfo["ownerID"]) {
			return true;
		}
		return false;
  }
	//客户端玩家是否是房主
  public IsClientIsOwner() {
		let heroID = this.HeroManager.GetHeroID();
		if (heroID == this.dataInfo["ownerID"]) {
			return true
		}
		return false
  }

	//获取指定位置闪电出牌结束时间
  public GetActionEndTick(pos) {
		//不是牌局进行中
		if (this.dataInfo["state"] != this.ShareDefine.RoomState_Playing) {
			console.error("GetActionEndTick not AYDSSRoomState_Playing");
			return 0;
		}

		let setRound = this.GetRoomSet().GetRoomSetProperty("setRound");
		if (!setRound) {
			return 0;
		}
		let startWaitSec = setRound["startWaitSec"];
		let endTick = startWaitSec * 1000 + this.PropertyInfo["AYDSSRoom_WaitTick"];

		let opPosList = setRound["opPosList"];
		let count = opPosList.length;
		for (let index = 0; index < count; index++) {
			let opInfo = opPosList[index];

			//如果查询位置当前需要执行动作
			if (opInfo["waitOpPos"] == pos) {
				return endTick;
			}
		}
		return 0;
  }


	//获取玩家setPos对象
  public GetClientPlayerSetPos() {

		let pos = this.RoomPosMgr.GetClientPos();
		if (pos < 0) {
			console.error("GetClientPlayerSetPos not enter room");
			return
		}
		let setPos = this.RoomSet.GetSetPosByPos(pos);
		if (!setPos) {
			console.error("GetClientPlayerSetPos(%s) not find setPos", pos);
			return
		}
		return setPos
  }

	//获取客户端玩家信息
  public GetClientPlayerInfo() {
		let pos = this.RoomPosMgr.GetClientPos();
		if (pos < 0) {
			console.error("GetClientPlayerInfo not enter room");
			return
		}
		let playerInfo = this.RoomPosMgr.GetPlayerInfoByPos(pos);
		if (!playerInfo) {
			console.error("GetClientPlayerInfo(%s) not find playerInfo", pos);
			return
		}
		return playerInfo
  }
}
