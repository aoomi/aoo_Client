// @ts-nocheck
// Generated from the Creator 2.2.2 AYCP room model; method bodies and protocol semantics are preserved.
export type LegacyAycpAppContext = Record<string, any>;
export class LegacyAycpSetPosition {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAycpAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = this.app.subGameName + "SetPos";
		this.PokerCard = this.app[this.app.subGameName.toUpperCase() + "PokerCard"]();
		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.OnReload();
		this.Log("Init");
  }

  public OnReload() {
		this.dataInfo = {
			posID: 0,
			handCard: 0,
			shouCard: [],
			outCard: [],
			publicCardList: [],
			huCard: [],
			huDian: [],
		};
  }

	//-----------------------回调函数-----------------------------
	//开局初始化
  public OnInitSetPos(setPosInfo) {
		this.dataInfo = setPosInfo;
		// this.SortShouCard();
		this.SortShouCardOne();
		this.Log("OnInitSetPos:", this.dataInfo);
  }

	//抓到一张牌
  public OnPosGetCard(setPosInfo) {
		this.dataInfo = setPosInfo;
		this.Log("OnPosGetCard:", this.dataInfo);
		return true;
  }

	//打出一张牌后
  public OnPosOpCard(setPosInfo) {
		this.dataInfo = setPosInfo;
		// this.SortShouCard();
		this.SortShouCardOne();
		this.Log("OnPosOpCard:", this.dataInfo);
		return true;
  }
	//翻出一张牌后
  public OnPosFanPai(setPosInfo) {
		this.dataInfo["outCard"] = setPosInfo["outCard"];
		this.Log("OnPosOpCard:", this.dataInfo);
		return true;
  }

	//继续游戏需要清除之前的手牌记录
  public OnPosContinueGame() {
		this.dataInfo["handCard"] = 0;
		this.dataInfo["shouCard"] = [];
		this.dataInfo["outCard"] = [];
		this.dataInfo["publicCardList"] = [];
		this.dataInfo["huCard"] = [];
		this.dataInfo["huDian"] = [];
  }

	//----------------获取接口----------------------
	//获取位置信息
  public GetSetPosInfo() {
		return this.dataInfo;
  }

	//获取属性值
  public GetSetPosProperty(property) {
		if (!this.dataInfo.hasOwnProperty(property)) {
			console.error("GetSetPosProperty(%s) error", property);
			return;
		}
		return this.dataInfo[property];
  }
  public SetDataInfo(key, value) {
		this.dataInfo[key] = value;
  }

  public SortShouCardOne() {
		//从小到大直到7
		//从大到小直到7
		//手牌的排序
		//按照牌型分成6排
		let paiValueToIndex = {
			2: 1,
			12: 1,
			3: 2,
			11: 2,
			4: 3,
			10: 3,
			5: 4,
			9: 4,
			6: 5,
			8: 5,
			7: 6,
		};
		let shouPaiDict = {
			1: [],
			2: [],
			3: [],
			4: [],
			5: [],
			6: []
		};
		let shouCard = this.dataInfo["shouCard"];
		// shouCard = [403, 2004, 1001, 1002, 1003, 1004, 503, 504, 2101, 901, 902, 903, 904, 3904, 4003, 2404, 2403, 2401, 1201];
		if (shouCard[0] == 0) {
			console.error("没有手牌", shouCard);
			return;
		}
		let allResults = [];
		let useDanPai = [];
		let pokers = this.GetMonyPais(shouCard);//[[2,2],[4,4],[10,10],[12,12]];
		/*for (let i = 0; i < pokers.length; i++) {//从大到小排序
			pokers[i].sort((a, b) => {
				return this.PokerCard.GetCardValue(b) - this.PokerCard.GetCardValue(a);
			});
		}*/
		for (let i = 0; i < pokers.length; i++) {
			for (let j = i + 1; j < pokers.length; j++) {
				let value = this.PokerCard.GetCardValue(pokers[i][0]);
				let target = this.PokerCard.GetCardValue(pokers[j][0]);
				if (value + target == 14) {
					if (useDanPai.indexOf(pokers[i][0]) > -1 || useDanPai.indexOf(pokers[j][0]) > -1) {
						console.error("已经在使用过的数组中了");
						continue;
					}
					allResults.push(pokers[i].concat(pokers[j]));
					useDanPai = [].concat(useDanPai, pokers[i], pokers[j]);
				}
			}
		}
		//没有用过剩余的牌从小到大排序
		for (let i = 0; i < pokers.length; i++) {
			for (let j = 0; j < pokers[i].length; j++) {
				if (useDanPai.indexOf(pokers[i][j]) < 0) {
					allResults.push(pokers[i]);
					break;
				}
			}
		}

		for (let i = 0; i < allResults.length; i++) {//[[2,2],[4,4],[10,10],[12,12]];
			let cards = allResults[i];//[12,12];
			let value = this.PokerCard.GetCardValue(cards[0]);
			// shouPaiDict[paiValueToIndex[value]].push(cards);
			shouPaiDict[paiValueToIndex[value]]= cards;
		}
		let shouPaiResults = [];
		for (let key in shouPaiDict) {
			let cards = shouPaiDict[key];
			shouPaiResults.push(cards);
		}
		for (let i = 0; i < shouPaiResults.length; i++) {//从大到小排序
			shouPaiResults[i].sort((a, b) => {
				return this.PokerCard.GetCardValue(b) - this.PokerCard.GetCardValue(a);
			});
		}
		//将超过4张的那组牌进行分离
		let cAllResults = [];
		for (let i = 0; i < shouPaiResults.length; i++) {
			let cards = shouPaiResults[i];
			if (cards.length > 0 && cards.length <= 4) {
				cAllResults.push(shouPaiResults[i]);
			} else {// > 4
				let chai = [];
				let chai1 = [];
				let chai2 = [];
				let chai3 = [];
				for (let i = 0; i < cards.length; i++) {
					if (i < 4) {//0-3
						chai1.push(cards[i]);
					} else if (i >= 4 && i < 8) {//3-7
						chai2.push(cards[i]);
					} else {//8-11
						chai3.push(cards[i]);
					}
				}
				if (chai1.length > 0) {
					chai.push(chai1);
				}
				if (chai2.length > 0) {
					chai.push(chai2);
				}
				if (chai3.length > 0) {
					chai.push(chai3);
				}
				chai.sort((a, b) => {
					return this.PokerCard.GetCardValue(b[0]) - this.PokerCard.GetCardValue(a[0]);
				});
				for (let j = 0; j < chai.length; j++) {
					cAllResults.push(chai[j]);
				}
			}
		}
		for (let i = 0; i < cAllResults.length; i++) {
			let cards = cAllResults[i];
			/*cards.sort((a, b) => {
				return this.PokerCard.GetCardValue(a) - this.PokerCard.GetCardValue(b);
			});*/
			if (cards.length == 1) {
				cards.unshift(0, 0, 0);
			}
			if (cards.length == 2) {
				cards.unshift(0, 0);
			}
			if (cards.length == 3) {
				cards.unshift(0);
			}
		}
		if (cAllResults.length > 8) {
			console.error("手牌渲染出错，超过8列");
		}
		this.dataInfo["shouCard"] = cAllResults;
		console.log(shouCard, allResults, shouPaiDict, shouPaiResults, cAllResults);
  }
  public SortShouCard() {
		let shouCard = this.dataInfo["shouCard"];
		// shouCard = [403, 2004, 1001, 1002, 1003, 1004, 503, 504, 2101, 901, 902, 903, 904, 3904, 4003, 2404, 2403, 2401, 1201];
		if (shouCard[0] == 0) {
			console.error("没有手牌", shouCard);
			return;
		}
		//4行7竖
		//第一排从小到大排序
		//第二排可以凑14点的开始排，多出4行另取一竖，往后继续叠加
		//找出相同的牌值为1组
		let pokers = this.GetMonyPais(shouCard);
		for (let i = 0; i < pokers.length; i++) {
			pokers[i].sort((a, b) => {
				return this.PokerCard.GetCardValue(a) - this.PokerCard.GetCardValue(b);
			});
		}

		let allResults = [];
		let useDanPai = [];
		//1、单张和多组牌组成14张
		//多张和多组牌组成14张  4张和4张

		for (let l = 0; l < pokers.length; l++) {
			for (let i = l + 1; i < pokers.length; i++) {
				let value = this.PokerCard.GetCardValue(pokers[l][0]);
				let target = this.PokerCard.GetCardValue(pokers[i][0]);
				if (value + target == 14) {
					if (useDanPai.indexOf(pokers[l][0]) > -1 || useDanPai.indexOf(pokers[i][0]) > -1) {
						console.error("已经在使用过的数组中了");
						continue;
					}
					allResults.push(pokers[l].concat(pokers[i]));
					useDanPai = [].concat(useDanPai, pokers[l], pokers[i]);
				}
			}
		}
		//没有用过剩余的牌从小到大排序
		for (let i = 0; i < pokers.length; i++) {
			for (let j = 0; j < pokers[i].length; j++) {
				if (useDanPai.indexOf(pokers[i][j]) < 0) {
					allResults.push(pokers[i]);
					break;
				}
			}
		}
		allResults.sort((a, b) => {
			return this.PokerCard.GetCardValue(a[0]) - this.PokerCard.GetCardValue(b[0]);
		});
		//将超过4张的那组牌进行分离
		let cAllResults = [];
		for (let i = 0; i < allResults.length; i++) {
			let cards = allResults[i];
			if (cards.length <= 4) {
				cAllResults.push(allResults[i]);
			} else {// > 4
				let chai = [];
				let chai1 = [];
				let chai2 = [];
				let chai3 = [];
				for (let i = 0; i < cards.length; i++) {
					if (i < 4) {//0-3
						chai1.push(cards[i]);
					} else if (i >= 4 && i < 8) {//3-7
						chai2.push(cards[i]);
					} else {//8-11
						chai3.push(cards[i]);
					}
				}
				if (chai1.length > 0) {
					chai.push(chai1);
				}
				if (chai2.length > 0) {
					chai.push(chai2);
				}
				if (chai3.length > 0) {
					chai.push(chai3);
				}
				chai.sort((a, b) => {
					return this.PokerCard.GetCardValue(a[0]) - this.PokerCard.GetCardValue(b[0]);
				});
				for (let j = 0; j < chai.length; j++) {
					cAllResults.push(chai[j]);
				}
			}
		}
		for (let i = 0; i < cAllResults.length; i++) {
			let cards = cAllResults[i];
			cards.sort((a, b) => {
				return this.PokerCard.GetCardValue(a) - this.PokerCard.GetCardValue(b);
			});
			if (cards.length == 1) {
				cards.unshift(0, 0, 0);
			}
			if (cards.length == 2) {
				cards.unshift(0, 0);
			}
			if (cards.length == 3) {
				cards.unshift(0);
			}
		}
		if (cAllResults.length > 8) {
			console.error("手牌渲染出错，超过8列");
		}
		console.log("3整理后的手牌", cAllResults, allResults, useDanPai);
		this.dataInfo["shouCard"] = cAllResults;
  }
  public GetMonyPais(shouCard) {
		let cards = [];
		for (let i = 0; i < shouCard.length; i++) {
			let poker = shouCard[i];
			let pokers = this.PokerCard.GetSameValue(shouCard, poker);
			let bInList4 = this.PokerCard.CheckPokerInListEx(cards, poker);
			if (!bInList4) {
				this.PokerCard.PushTipCard(cards, pokers, pokers.length);
			}
		}
		console.log("获取相同的牌值的数组", cards);
		return cards;
  }
}
