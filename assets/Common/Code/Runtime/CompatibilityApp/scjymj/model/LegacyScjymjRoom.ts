// @ts-nocheck
// Generated from the Creator 2.2.2 SCJYMJ model. Method bodies and protocol semantics are preserved.
export type LegacyScjymjAppContext = Record<string, any>;

export class LegacyScjymjRoom {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;

  public constructor(private readonly app: LegacyScjymjAppContext) {
    this.Init();
  }


  public Init() {
		this.JS_Name = "SCJYMJRoom";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.HeroManager = this.app[this.app.subGameName + "_HeroManager"]();

		this.SCJYMJRoomPosMgr = this.app[this.app.subGameName.toUpperCase() + "RoomPosMgr"]();
		this.SCJYMJRoomSet = this.app[this.app.subGameName.toUpperCase() + "RoomSet"]();
		this.SysDataManager = this.app[this.app.subGameName + "_SysDataManager"]();

		this.PropertyInfo = this.SysDataManager.GetTableDict("PropertyInfo");

		this.OnReload();
  }

  public OnReload() {

		//{
		//	"roomID":1,
		//	"key":"123456",
		//	"createSec":nowSec,
		//	"state":roomState,
		//	"setID":0,
		//	"roomEnd":{},
		//	"dissolve":{"endSec":0,"createPos":0,"posAgreeList":[]},
		//}
		this.dataInfo = {};

		//{
		//	"setCount":4,
		//}
		this.roomConfig = {};

		this.roomRecord = {};

		this.SCJYMJRoomPosMgr.OnReload();
		this.SCJYMJRoomSet.OnReload();
  }

	//-----------------------回调函数-----------------------------
	//登录初始化房间数据
  public OnInitRoomData(serverPack) {
		serverPack["state"] = this.ShareDefine.RoomStateStringDict[serverPack["state"]];

		if (serverPack.prizeType == 'Gold') {
			this.app[this.app.subGameName + "_ShareDefine"]().isCoinRoom = true;
		}
		else if (serverPack.prizeType == 'RoomCard') {
			this.app[this.app.subGameName + "_ShareDefine"]().isCoinRoom = false;
		}

		let cfg = serverPack["cfg"];
		this.roomConfig = cfg;

		let roomPosInfoList = serverPack["posList"] || [];
		this.SCJYMJRoomPosMgr.OnInitRoomPosData(roomPosInfoList);

		let setInfo = serverPack["set"];
		this.SCJYMJRoomSet.OnInitRoomSetData(setInfo);
		//初始化金

		//其余信息存放到dataInfo
		this.dataInfo = serverPack;
		// console.log("roomConfig:" + JSON.stringify(this.roomConfig));
  }

	/*
	*战绩兼容扑克
	 */
  public SetGameRecord(bget) {

  }
	//位置离开
  public OnPosLeave(pos) {
		this.SCJYMJRoomPosMgr.OnPosLeave(pos);
		this.SCJYMJRoomSet.OnPosLeave(pos);
  }
  public UpdateOwnerID(ownerID) {
		this.dataInfo['ownerID'] = ownerID;
  }
	//继续游戏
  public OnPosContinueGame(pos) {
		this.SCJYMJRoomPosMgr.OnPosContinueGame(pos);
		this.SCJYMJRoomSet.OnPosContinueGame(pos);
  }

	//set开始
  public OnSetStart(setInfo) {
		this.dataInfo["state"] = this.ShareDefine.RoomState_Playing;
		this.dataInfo["setID"] = setInfo["setID"];
		this.GetRoomSet().OnSetStart(setInfo);
  }
  public OnSetPlaying() {
		this.dataInfo["state"] = this.ShareDefine.RoomState_Playing;
		this.dataInfo["setID"] = 1;
  }

	//set结束
  public OnSetEnd(setEnd) {
		this.SCJYMJRoomSet.OnSetEnd(setEnd);
		this.SCJYMJRoomPosMgr.OnSetEnd(setEnd);
  }

	//房间结束
  public OnRoomEnd(roomEnd) {
		this.dataInfo["state"] = this.ShareDefine.RoomState_End;
		this.dataInfo["roomEnd"] = roomEnd;
  }

	//开始解散房间
  public OnStartVoteDissolve(createPos, endSec) {
		let posAgreeList = [];
		for (let index = 0; index < this.ShareDefine.SCJYMJRoomJoinCount; index++) {
			if (index == createPos) {
				posAgreeList.push(1);
			}
			else {
				posAgreeList.push(0);
			}
		}
		let dissolveInfo = { "endSec": endSec, "createPos": createPos, "posAgreeList": posAgreeList };
		this.dataInfo["dissolve"] = dissolveInfo;
		return dissolveInfo;
  }

	//位置同意拒绝更新
  public OnPosDealVote(pos, agreeDissolve) {

		let dissolveInfo = this.dataInfo["dissolve"];
		let posAgreeList = dissolveInfo["posAgreeList"];
		if (!posAgreeList) {
			this.ErrLog("OnPosDealVote not find posAgreeList:", this.dataInfo);
			return
		}

		if (pos >= posAgreeList.length) {
			this.ErrLog("OnPosDealVote(%s,%s):", pos, agreeDissolve, posAgreeList);
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
  public OnClubCentChange(serverPack) {
		this[this.app.subGameName.toUpperCase() + "RoomPosMgr"].OnClubCentChange(serverPack);
  }
	//更新Room datainfo数据
  public UpdataInfo(serverPack) {
		this.GetRoomPosMgr().OnPosOpCard(serverPack);
		return this.GetRoomSet().OnPosOpCard(serverPack)
  }
	//---------------------设置函数---------------------
	//删除已经打出的卡牌
  public OnDeleteOutCard(cardID) {
		//如果是不是在牌局进行中
		if (this.dataInfo["state"] != this.ShareDefine.RoomState_Playing) {
			this.ErrLog("OnDeleteOutCard not SCJYMJRoomState_Playing");
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
			this.ErrLog("GetRoomProperty not find:%s", property);
			return
		}
		return this.dataInfo[property];
  }
  public ClearDissolve() {
		this.dataInfo['dissolve'] = '';
  }
	//获取房间配置信息
  public GetRoomConfig() {
		return this.roomConfig
  }

	//获取房间配置信息
  public GetRoomConfigByProperty(property) {
		if (!this.roomConfig.hasOwnProperty(property)) {
			this.ErrLog("GetRoomConfigByProperty not find:%s", property);
			return
		}
		return this.roomConfig[property];
  }

  public GetRoomSet() {
		let setID = this.dataInfo["setID"];
		if (!setID) {
			this.ErrLog("GetSet not start set");
			return
		}
		return this.SCJYMJRoomSet
  }

  public GetRoomPosMgr() {
		return this.SCJYMJRoomPosMgr
  }
	//客户端玩家是否是开房人
  public IsClientIsCreater() {
		let heroID = this.HeroManager.GetHeroID();
		if (heroID == this.dataInfo["ownerID"]) {
			return true
		}
		return false
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
			this.ErrLog("GetActionEndTick not SCJYMJRoomState_Playing");
			return 0
		}

		let setRound = this.GetRoomSet().GetRoomSetProperty("setRound");
		if (!setRound) {
			return 0
		}
		let startWaitSec = setRound["startWaitSec"];
		let endTick = startWaitSec * 1000 + this.PropertyInfo["SCJYMJRoom_WaitTick"];

		let opPosList = setRound["opPosList"];
		let count = opPosList.length;
		for (let index = 0; index < count; index++) {
			let opInfo = opPosList[index];

			//如果查询位置当前需要执行动作
			if (opInfo["waitOpPos"] == pos) {
				return endTick
			}
		}
		return 0
  }


	//获取玩家setPos对象
  public GetClientPlayerSetPos() {

		let pos = this.SCJYMJRoomPosMgr.GetClientPos();
		if (pos < 0) {
			this.ErrLog("GetClientPlayerSetPos not enter room");
			return
		}
		let setPos = this.SCJYMJRoomSet.GetSetPosByPos(pos);
		if (!setPos) {
			this.ErrLog("GetClientPlayerSetPos(%s) not find setPos", pos);
			return
		}
		return setPos
  }

	//获取客户端玩家信息
  public GetClientPlayerInfo() {
		let pos = this.SCJYMJRoomPosMgr.GetClientPos();
		if (pos < 0) {
			this.ErrLog("GetClientPlayerInfo not enter room");
			return
		}
		let playerInfo = this.SCJYMJRoomPosMgr.GetPlayerInfoByPos(pos);
		if (!playerInfo) {
			this.ErrLog("GetClientPlayerInfo(%s) not find playerInfo", pos);
			return
		}
		return playerInfo
  }
}
