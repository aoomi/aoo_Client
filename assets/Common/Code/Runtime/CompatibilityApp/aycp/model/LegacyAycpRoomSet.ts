// @ts-nocheck
// Generated from the Creator 2.2.2 AYCP room model; method bodies and protocol semantics are preserved.
export type LegacyAycpAppContext = Record<string, any>;
export class LegacyAycpRoomSet {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAycpAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = "AYDSSRoomSet";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.allSetPosDict = {};
		this.cacheSetPosDict = {};
		for (let posID = 0; posID < 4; posID++) {
			this.cacheSetPosDict[posID] = this.app[this.app.subGameName.toUpperCase() + "SetPos"]();
		}
		this.OnReload();

		this.Log("Init");

  }
  public get_jin1() {
		return this.dataInfo.jin;
  }
  public get_jin2() {
		if (this.dataInfo['jin2']) {
			return this.dataInfo.jin2;
		}
		return 0;
  }
  public set_jin1(cardID) {
		this.dataInfo['jin'] = cardID;
  }
  public set_jin2(cardID) {
		this.dataInfo['jin2'] = cardID;
  }
  public OnReload() {
		for (let posID in this.allSetPosDict) {
			let setPos = this.allSetPosDict[posID];
			setPos.OnReload();
			this.cacheSetPosDict[posID] = setPos
		}
		this.allSetPosDict = {};
		this.dataInfo = {};
  }
  public SetState(state) {
		this.dataInfo['state'] = state;
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
				console.error("OnInitRoomSetData cacheSetPosDict not find:%s", posID);
				setPos = this.app[this.app.subGameName.toUpperCase() + "SetPos"]();
			}
			setPos.OnInitSetPos(setPosInfo);
			this.allSetPosDict[posID] = setPos
		}
		if (setInfo['setRound']) {
			this.OnStartRound(setInfo['setRound']);
		}
		let setEnd = setInfo["setEnd"];
		this.dataInfo = setInfo;
		if (setEnd['endTime'] > 0) {
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
				console.error("OnInitRoomSetData cacheSetPosDict not find:%s", posID);
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
		}
		else {
			console.error("OnInitRoomSetData state:%s not find", state);
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
	//游戏状态改变
  public OnChangeStatus() {
		this.dataInfo["state"] = this.ShareDefine.SetState_Waiting;
  }
  public OnSetEnd(setEnd) {
		/*let posHuList = setEnd["posHuList"];
		let count = posHuList.length;
		for (let index = 0; index < count; index++) {
			let posInfo = posHuList[index];
			let huType = posInfo["huType"];
			posInfo["huType"] = this.ShareDefine.HuTypeStringDict[huType];
		}*/
		this.dataInfo["setEnd"] = setEnd;
		this.dataInfo["state"] = this.ShareDefine.SetState_End;
  }

  public OnStartRound(setRound) {
		/*let waitID = setRound["waitID"];
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
		}*/
		//测试 UIAYCPPlay.js
		/*if (opList.indexOf("Out") > -1 && opList.length > 1) {
			let outIndex = opList.indexOf("Out");
			opList.splice(outIndex, 1);
			opList.splice(1, 0, "cPass");
			this.RoomSet.SetStartRoundOpList(opList);
			this.RedisplayPosActionHelp();
		}*/
		/*let opPosList = setRound["opPosList"][0];
		if (opPosList) {
			opPosList.opList = ["Hu", "cPass"];
		}*/
		this.dataInfo["setRound"] = setRound;
  }
  public SetStartRoundOpList(opList) {
		let setRound = this.dataInfo["setRound"];
		let opPosList = setRound["opPosList"][0];
		opPosList.opList = opList;
  }

	//指定位置获取卡牌
  public OnPosGetCard(pos, setPosInfo, normalMoCnt, gangMoCnt) {
		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			console.error("OnPosGetCard not find(%s)", pos);
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
		let opCard = serverPack["opCard"];

		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			console.error("OnPosOpCard not find(%s)", pos);
			return false;
		}

		//更新当前等待接收的卡牌
		this.dataInfo["waitReciveCard"] = opCard;
		this.Log("dataInfo:", this.dataInfo);
		return setPos.OnPosOpCard(setPosInfo);
  }
	//指定位置翻牌后
  public OnPosFanPai(serverPack) {
		let pos = serverPack["pos"];
		let setPosInfo = serverPack["setPos"];
		let setPos = this.allSetPosDict[pos];
		if (!setPos) {
			console.error("OnPosOpCard not find(%s)", pos);
			return false;
		}
		this.Log("dataInfo:", this.dataInfo);
		return setPos.OnPosFanPai(setPosInfo);
  }
	//打牌预先处理
  public PreSetShouCard(pos, cardID) {
		let setPos = this.allSetPosDict[pos];
		let shouCard = setPos.GetSetPosProperty("shouCard");
		let handCard = setPos.GetSetPosProperty("handCard");
		if (handCard > 0 && handCard == cardID) {
			setPos.SetDataInfo('handCard', 0);
		} else {
			shouCard.Remove(cardID);
			if (handCard > 0) {
				shouCard.push(handCard);
				setPos.SetDataInfo('handCard', 0);
				//手牌刷新
				let jin1 = this.get_jin1();
				let jin2 = this.get_jin2();
				let newShouCard = [];
				let newShouCard2 = [];
				let oldShouCard = [];
				let count = 0;
				//先抽出金
				count = shouCard.length;
				for (let i = 0; i < count; i++) {
					oldShouCard.push(shouCard[i]);//shoucard存临时数组
				}
				for (let i = 0; i < count; i++) {
					if (Math.floor(shouCard[i] / 100) == Math.floor(jin1 / 100) || Math.floor(shouCard[i] / 100) == Math.floor(jin2 / 100)) {
						newShouCard.push(shouCard[i]);
						oldShouCard.Remove(shouCard[i]);
					}
				}
				count = oldShouCard.length;
				//白板换成金排序
				for (let i = 0; i < count; i++) {
					if (Math.floor(oldShouCard[i] / 100) == 47) {
						//白板
						let yushu = oldShouCard[i] % 100;
						let newCardID = Math.floor(jin1 / 100) * 100 + yushu + 4;
						newShouCard2.push(newCardID);
					} else {
						newShouCard2.push(oldShouCard[i]);
					}
				}
				newShouCard2.SortList();
				//数组合并
				count = newShouCard2.length;
				for (let i = 0; i < count; i++) {
					if (Math.floor(newShouCard2[i] / 100) == Math.floor(jin1 / 100)) {
						//白板
						let yushu = newShouCard2[i] % 100;
						let newCardID2 = 4700 + yushu - 4;
						newShouCard.push(newCardID2);
					} else {
						newShouCard.push(newShouCard2[i]);
					}
				}
				setPos.SetDataInfo('shouCard', newShouCard);
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


	//----------------获取接口--------------------

	//获取set属性值
  public GetRoomSetProperty(property) {
		if (!this.dataInfo.hasOwnProperty(property)) {
			console.error("GetSetProperty(%s) not find", property);
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
			console.error("GetSetPosByPos not find:%s", pos);
			return
		}
		return setPos
  }

	//获取指定类型的卡牌剩余未出数量
  public GetHuCardTypeInfo(selfPos) {

		let outCardIDList = [];
		let selfSetPos = this.allSetPosDict[selfPos];
		if (!selfSetPos) {
			console.error("GetHuCardLeftInfo not find selfPos:%s", selfPos);
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

}
