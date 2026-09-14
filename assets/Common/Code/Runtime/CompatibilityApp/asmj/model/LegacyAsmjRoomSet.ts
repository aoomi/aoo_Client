// @ts-nocheck
// Generated from the Creator 2.2.2 ASMJ room model; method bodies and protocol semantics are preserved.
export type LegacyAsmjAppContext = Record<string, any>;
export class LegacyAsmjRoomSet {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAsmjAppContext) { this.Init(); }


  public Init() {

		this.JS_Name = this.app["subGameName"] + "RoomSet";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.allSetPosDict = {};
		this.cacheSetPosDict = {};
		for (let posID = 0; posID < this.ShareDefine[this.app.subGameName.toUpperCase() + "RoomJoinCount"]; posID++) {
			this.cacheSetPosDict[posID] = this.app[this.app.subGameName.toUpperCase() + "SetPos"]();
		}
		this.OnReload();

		this.Log("Init");

  }
  public get_huangZhuang() {
		return this.dataInfo["huangZhuang"];
  }
  public get_fengHua() {
		return this.dataInfo["fengHua"];
  }
  public get_jin1() {
		return this.dataInfo["jin1"] || this.dataInfo["jin"] || 0;
  }
  public get_jin2() {
		return this.dataInfo["jin2"] || 0;
  }
  public get_jinJin() {
		return this.dataInfo["jinJin"] || 0;
  }
  public set_jin1(cardID) {
		this.dataInfo["jin1"] = cardID;
		this.dataInfo["jin"] = cardID;
  }
  public set_jin2(cardID) {
		this.dataInfo["jin2"] = cardID;
  }
  public set_jinjin(cardID) {
		this.dataInfo["jinJin"] = cardID;
  }

  public GetPiaoFenList() {
		let piaoFenList = this.dataInfo["piaoFenList"];
		if (0 == piaoFenList.length) {	// 初始化为默认值
			this.RoomPosMgr = this.app[this.app.subGameName.toUpperCase() + "RoomPosMgr"]();
			let count = this.RoomPosMgr.GetRoomPlayerCount();
			for (let i = 0; i < count; i++) {
				piaoFenList[i] = -1;
			}
		}
		return piaoFenList;
  }

  public SetPiaoFenList(piaoFenList) {
		this.dataInfo["piaoFenList"] = piaoFenList;
  }

  public OnReload() {
		for (let posID in this.allSetPosDict) {
			let setPos = this.allSetPosDict[posID];
			setPos.OnReload();
			this.cacheSetPosDict[posID] = setPos
		}
		this.allSetPosDict = {};

		//{
		//	"setID":0,
		//	"dPos":0,
		//	"startPaiPos":0,
		//	"startPaiDun":0,
		//	"waitReciveCard":0,
		//	"state":0,
		//	"setEnd":{"posResultList":posResultList,"maCardList":maCardList,"zhongMa":0},
		//}
		this.dataInfo = {};
  }
  public SetState(state) {
		this.dataInfo["state"] = state;
  }
  public InitSetInfo(setInfo) {
		for (let posID in this.allSetPosDict) {
			let setPos = this.allSetPosDict[posID];
			setPos.OnReload();
			this.cacheSetPosDict[posID] = setPos
		}
		this.allSetPosDict = {};
		let setPosList = setInfo["setPosList"] || [];
		let count = setPosList.length;

		for (let index = 0; index < count; index++) {
			let setPosInfo = setPosList[index];
			let posID = setPosInfo["posID"];
			//获取缓存的setPos对象
			let setPos = this.cacheSetPosDict[posID];
			delete this.cacheSetPosDict[posID];
			if (!setPos) {
				//this.ErrLog("OnInitRoomSetData cacheSetPosDict not find:%s", posID);
				setPos = this.app[this.app.subGameName.toUpperCase() + "SetPos"]();
			}
			setPos.OnInitSetPos(setPosInfo);
			this.allSetPosDict[posID] = setPos
		}
		if (setInfo["setRound"]) {
			this.OnStartRound(setInfo["setRound"]);
		}
		let setEnd = setInfo["setEnd"];
		this.dataInfo = setInfo;
		if (setEnd["endTime"] > 0) {
			this.OnSetEnd(setEnd);
		}
  }
  public InitSetPosList(setPosList) {
		let count = setPosList.length;
		for (let posID in this.allSetPosDict) {
			let setPos = this.allSetPosDict[posID];
			setPos.OnReload();
			this.cacheSetPosDict[posID] = setPos
		}
		this.allSetPosDict = {};
		for (let index = 0; index < count; index++) {
			let setPosInfo = setPosList[index];
			let posID = setPosInfo["posID"];

			//获取缓存的setPos对象
			let setPos = this.cacheSetPosDict[posID];
			delete this.cacheSetPosDict[posID];
			if (!setPos) {
				//this.ErrLog("OnInitRoomSetData cacheSetPosDict not find:%s", posID);
				setPos = this.app[this.app.subGameName.toUpperCase() + "SetPos"]();
			}
			setPos.OnInitSetPos(setPosInfo);
			this.allSetPosDict[posID] = setPos
		}
  }


	//-----------------------回调函数-----------------------------
  public OnInitRoomSetData(setInfo) {
		this.InitSetInfo(setInfo);
		let state = this.dataInfo["state"];
		if (this.ShareDefine.SetStateStringDict.hasOwnProperty(state)) {
			this.dataInfo["state"] = this.ShareDefine.SetStateStringDict[state];
		} else {
			//this.ErrLog("OnInitRoomSetData state:%s not find", state);
		}
  }

  public OnPosLeave(pos) {
		let setPos = this.allSetPosDict[pos];
		//可能未开局没有allSetPosDict数据
		if (!setPos) {
			this.Log("OnPosLeave(%s) not find", pos);
			return
		}
		delete this.allSetPosDict[pos];
		this.cacheSetPosDict[pos] = setPos;
  }
  public OnPosContinueGame() {
		this.dataInfo["state"] = this.ShareDefine.SetState_Init;
		for (let pos in this.allSetPosDict) {
			this.allSetPosDict[pos].OnPosContinueGame();
		}
  }

  public OnSetStart(setInfo) {
		this.InitSetInfo(setInfo);
		this.dataInfo["state"] = this.ShareDefine.SetState_Playing;
  }

  public UpdateDPos(dPos) {
		this.dataInfo["dPos"] = dPos;
  }

  public OnSetEnd(setEnd) {
		let posResultList = setEnd["posResultList"];
		let count = posResultList.length;
		for (let index = 0; index < count; index++) {
			let posInfo = posResultList[index];
			let huType = posInfo["huType"];
			posInfo["huType"] = this.ShareDefine.HuTypeStringDict[huType];
		}
		this.dataInfo["setEnd"] = setEnd;
		this.dataInfo["state"] = this.ShareDefine.SetState_End;
  }

  public OnStartRound(setRound) {

		let waitID = setRound["waitID"];
		let startWaitSec = setRound["startWaitSec"];
		let opPosList = setRound["opPosList"];

		let count = opPosList.length;
		for (let index = 0; index < count; index++) {
			let roundPos = opPosList[index];
			let opList = roundPos["opList"];
			roundPos["opType"] = this.ShareDefine.OpTypeStringDict[roundPos["opType"]];
			let opCount = opList.length;
			let newOpList = [];
			for (let index_op = 0; index_op < opCount; index_op++) {
				newOpList.push(this.ShareDefine.OpTypeStringDict[opList[index_op]]);
			}
			roundPos["opList"] = newOpList;
		}
		this.dataInfo["setRound"] = setRound;
  }

	//指定位置获取卡牌
  public OnPosGetCard(pos, setPosInfo, normalMoCnt, gangMoCnt) {
		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			//this.ErrLog("OnPosGetCard not find(%s)", pos);
			return false
		}
		this.dataInfo["normalMoCnt"] = normalMoCnt;
		this.dataInfo["gangMoCnt"] = gangMoCnt;

		return setPos.OnPosGetCard(setPosInfo);
  }
  public SetRoomSetProperty(key, value) {
		this.dataInfo[key] = value;
  }
	//指定位置出牌后
  public OnPosOpCard(serverPack) {
		let pos = serverPack["pos"];
		let setPosInfo = serverPack["set_Pos"];
		let opType = serverPack["opType"];
		let opCard = serverPack["opCard"];

		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			//this.ErrLog("OnPosOpCard not find(%s)", pos);
			return false
		}

		opType = this.ShareDefine.OpTypeStringDict[opType];
		serverPack["opType"] = opType;

		//更新当前等待接收的卡牌
		this.dataInfo["waitReciveCard"] = opCard;
		this.dataInfo["setPosList"][pos] = setPosInfo;

		this.Log("dataInfo:", this.dataInfo);

		return setPos.OnPosOpCard(setPosInfo);
  }

  public UpdataInfoJiPai(serverPack) {
		let pos = serverPack["outPos"];
		let setPosInfo = serverPack["set_Pos"];
		// let opType = serverPack["opType"];
		// let opCard = serverPack["opCard"];

		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			//this.ErrLog("OnPosOpCard not find(%s)", pos);
			return false
		}

		// opType = this.ShareDefine.OpTypeStringDict[opType];
		// serverPack["opType"] = opType;

		//更新当前等待接收的卡牌
		// this.dataInfo["waitReciveCard"] = opCard;
		this.dataInfo["setPosList"][pos] = setPosInfo;

		this.Log("dataInfo:", this.dataInfo);

		return setPos.OnPosOpCard(setPosInfo);
  }

	// 打牌预先处理
  public PreSetShouCard(pos, cardID) {
		let setPos = this.allSetPosDict[pos];
		let shouCard = setPos.GetSetPosProperty("shouCard");
		let handCard = setPos.GetSetPosProperty("handCard");

		//手牌刷新
		if (handCard > 0 && handCard == cardID) {
			setPos.SetDataInfo('handCard', 0);
		} else {
			shouCard.Remove(cardID);
			if (handCard > 0) {
				shouCard.push(handCard);
				setPos.SetDataInfo('handCard', 0);
				let newShouCard = this.app[this.app.subGameName + "_MJConfig"].SortCardsLogic(shouCard);
				setPos.SetDataInfo("shouCard", newShouCard);
			}
		}
  }

	//删除掉已经打出去的牌
  public OnDeleteOutCard(cardID) {
		let findPos = -1;

		for (let pos in this.allSetPosDict) {
			let setPos = this.allSetPosDict[pos];
			let outCard = setPos.GetSetPosProperty("outCard");
			//如果找到需要删除的卡牌
			if (outCard.InArray(cardID)) {
				outCard.Remove(cardID);
				findPos = pos;
				break
			}
		}

		return findPos
  }

	//添加打出去的牌
  public OnAddOutCard(pos, cardID) {
		let setPos = this.allSetPosDict[pos];
		let outCard = setPos.GetSetPosProperty("outCard");
		//如果找到需要删除的卡牌
		if (outCard.InArray(cardID)) {
			return false;
		} else {
			outCard.push(cardID);
			return true;
		}
  }
  public unLock(pos) {
		let setPos = this.allSetPosDict[pos];
		setPos.SetDataInfo('isLock', false);
  }

	//----------------获取接口--------------------

	//获取set属性值
  public GetRoomSetProperty(property) {
		if (!this.dataInfo.hasOwnProperty(property)) {
			//this.ErrLog("GetSetProperty(%s) not find", property);
			return
		}
		return this.dataInfo[property];
  }

  public GetRoomSetInfo() {
		return this.dataInfo
  }

  public GetSetPosByPos(pos) {
		if (pos == -1) {
			return
		}
		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			//this.ErrLog("GetSetPosByPos not find:%s", pos);
			return
		}
		return setPos
  }

	//获取指定类型的卡牌剩余未出数量
  public GetHuCardTypeInfo(selfPos) {

		let outCardIDList = [];
		let selfSetPos = this.allSetPosDict[selfPos];
		if (!selfSetPos) {
			//this.ErrLog("GetHuCardLeftInfo not find selfPos:%s", selfPos);
			return {}
		}

		for (var pos in this.allSetPosDict) {
			let setPos = this.allSetPosDict[pos];

			//如果是本家,需要加上手卡
			if (selfPos == pos) {
				outCardIDList = outCardIDList.concat(setPos.GetSetPosProperty("shouCard"));
				let handCard = setPos.GetSetPosProperty("handCard");
				if (handCard > 0) {
					outCardIDList.push(handCard);
				}
			}
			//加上打出去的牌
			outCardIDList = outCardIDList.concat(setPos.GetSetPosProperty("outCard"));

			//加上吃到的牌
			let publicCardList = setPos.GetSetPosProperty("publicCardList");
			let publicCount = publicCardList.length;
			for (let index = 0; index < publicCount; index++) {
				let publicInfoList = publicCardList[index];
				//操作类型
				let opType = publicInfoList[0];
				if (opType == this.app[this.app.subGameName + "_ShareDefine"]().OpType_AnGang && selfPos != pos) {
					//选中不可探牌玩法,不是本家，暗杠的情况，暗杠的牌，如果有听牌暗杠的牌，也要算到听牌里面
					continue;
				}
				let cardIDList = publicInfoList.slice(3, publicInfoList.length);
				outCardIDList = outCardIDList.concat(cardIDList);
			}
		}

		outCardIDList.SortList();

		let allCardTypeDict = {};
		let allCount = outCardIDList.length;
		for (let index = 0; index < allCount; index++) {
			let cardID = outCardIDList[index];
			let cardType = Math.floor(cardID / 100);

			if (allCardTypeDict.hasOwnProperty(cardType)) {
				allCardTypeDict[cardType] += 1;
			}
			else {
				allCardTypeDict[cardType] = 1;
			}
		}

		let huCardTypeInfo = {};
		let huCardTypeList = selfSetPos.GetSetPosProperty("huCard");
		let count = huCardTypeList.length;
		for (var index = 0; index < count; index++) {
			let cardType = huCardTypeList[index];
			let leftCount = 4;
			if (allCardTypeDict.hasOwnProperty(cardType)) {
				leftCount = 4 - allCardTypeDict[cardType];
			}
			huCardTypeInfo[cardType] = leftCount;
		}

		this.Log("huCardTypeInfo:", huCardTypeInfo);
		return huCardTypeInfo
  }

	//获取指定类型的卡牌剩余未出数量
  public GetLeftCardTypeInfo(selfPos) {
		let outCardIDList = [];
		let selfSetPos = this.allSetPosDict[selfPos];
		if (!selfSetPos) {
			//this.ErrLog("GetHuCardLeftInfo not find selfPos:%s", selfPos);
			return {}
		}

		for (var pos in this.allSetPosDict) {
			let setPos = this.allSetPosDict[pos];

			//如果是本家,需要加上手卡
			if (selfPos == pos) {
				outCardIDList = outCardIDList.concat(setPos.GetSetPosProperty("shouCard"));
				let handCard = setPos.GetSetPosProperty("handCard");
				if (handCard > 0) {
					outCardIDList.push(handCard);
				}
			}
			//加上打出去的牌
			outCardIDList = outCardIDList.concat(setPos.GetSetPosProperty("outCard"));

			//加上吃到的牌
			let publicCardList = setPos.GetSetPosProperty("publicCardList");
			let publicCount = publicCardList.length;
			for (let index = 0; index < publicCount; index++) {
				let publicInfoList = publicCardList[index];
				if (publicInfoList[0] == this.app[this.app.subGameName + "_ShareDefine"]().OpType_AnGang) {
					continue;
				}
				let cardIDList = publicInfoList.slice(3, publicInfoList.length);
				outCardIDList = outCardIDList.concat(cardIDList);
			}
		}

		outCardIDList.SortList();

		let allCardTypeDict = {};
		let allCount = outCardIDList.length;
		for (let index = 0; index < allCount; index++) {
			let cardID = outCardIDList[index];
			let cardType = Math.floor(cardID / 100);

			if (allCardTypeDict.hasOwnProperty(cardType)) {
				allCardTypeDict[cardType] += 1;
			}
			else {
				allCardTypeDict[cardType] = 1;
			}
		}
		return allCardTypeDict;
  }

}
