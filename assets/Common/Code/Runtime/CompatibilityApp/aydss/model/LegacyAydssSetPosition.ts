// @ts-nocheck
// Generated from the Creator 2.2.2 AYDSS room model; method bodies and protocol semantics are preserved.
export type LegacyAydssAppContext = Record<string, any>;
export class LegacyAydssSetPosition {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAydssAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = "AYDSSSetPos";
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
		this.SortShouCard();
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
		this.SortShouCard();
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
			this.ErrLog("GetSetPosProperty(%s) error", property);
			return;
		}
		return this.dataInfo[property];
  }
  public SetDataInfo(key, value) {
		this.dataInfo[key] = value;
  }
	/*
		鬼牌排序在最左侧；
		有多张相同点数的牌，按照张数排序，张数多的排序在左；
		单牌可以组成十四点的放置在一起；
		多个组成十四点的牌，则按组成十四点的牌中点数大的牌在左侧；
		无法组成十四点的单牌，按照牌的点数从大到小排序；
		同点数的牌按花色排序：黑桃、红桃、梅花、方块；*/
	// SortShouCard: function (pokers) {
  public SortShouCard() {
		let GuiPai = [];
		let NewPai = [];
		let DanPai = [];
		let _t = this;
		let countList = [];
		let shouCard = this.dataInfo["shouCard"];
		// let shouCard = pokers;
		if (shouCard[0] == 0) {
			return;
		}
		for (let i = 0; i < shouCard.length; i++) {
			let cardColor = this.PokerCard.GetCardColor(shouCard[i]);
			let cardValue = this.PokerCard.GetCardValue(shouCard[i]);
			if ("64" == cardColor) {
				GuiPai.push(shouCard[i]);
			} else {
				NewPai.push(shouCard[i]);
				if (countList[cardValue]) {
					countList[cardValue]["num"]++;
				} else {
					countList[cardValue] = [];
					countList[cardValue]["num"] = 1;
					countList[cardValue]["cardValue"] = cardValue;
					countList[cardValue]["poker"] = shouCard[i];
				}
			}
		}
		//先添加鬼牌在最左边start
		GuiPai.sort(function (a, b) {
			return (b & 0x0F) - (a & 0x0F);
		});
		let Sortpokers = [];
		let lastPokers = [];
		for (let i = 0; i < GuiPai.length; i++) {
			lastPokers.push(GuiPai[i]);
		}
		//先添加鬼牌在最左边finish
		countList.sort(function (a, b) {
			if (b.num == a.num) {
				return b.cardValue - a.cardValue;
			}
			return b.num - a.num;
		});

		NewPai.sort(function (a, b) {
			let avalue = _t.PokerCard.GetCardValue(a);
			let bvalue = _t.PokerCard.GetCardValue(b);
			if (avalue == bvalue) {
				let aColor = _t.PokerCard.GetCardColor(a);
				let bColor = _t.PokerCard.GetCardColor(b);
				return bColor - aColor;
			} else {
				return (b & 0x0F) - (a & 0x0F);
			}

		});
		for (let j = 0; j < countList.length; j++) {
			if (countList[j]) {
				let cardNum = countList[j]["num"]; // 0,3 1,1
				if (cardNum > 1) {
					for (let k = 0; k < NewPai.length; k++) {
						let NewPaiVal = this.PokerCard.GetCardValue(NewPai[k]);
						let countVal = countList[j]["cardValue"];
						if (NewPaiVal == countVal) {
							Sortpokers.push(NewPai[k]);
						}
					}
				} else if (cardNum == 1) {
					DanPai.push(countList[j]["poker"]);
				}
			}
		}

		let siZhangs = [];
		let sanTiaos = [];
		let duiZis = [];
		//找出相同的牌为1组
		for (let i = 0; i < Sortpokers.length; i++) {
			let poker = Sortpokers[i];
			let siZhang = this.PokerCard.GetSameValue(Sortpokers, poker);
			let bInList4 = this.PokerCard.CheckPokerInListEx(siZhangs, poker);
			if (siZhang.length == 4 && !bInList4) {
				this.PokerCard.PushTipCard(siZhangs, siZhang, 4);
			}
			let sanTiao = this.PokerCard.GetSameValue(Sortpokers, poker);
			let bInList3 = this.PokerCard.CheckPokerInListEx(sanTiaos, poker);
			if (sanTiao.length == 3 && !bInList3) {
				this.PokerCard.PushTipCard(sanTiaos, sanTiao, 3);
			}
			let duizi = this.PokerCard.GetSameValue(Sortpokers, poker);
			let bInList = this.PokerCard.CheckPokerInListEx(duiZis, poker);
			if (duizi.length == 2 && !bInList) {
				this.PokerCard.PushTipCard(duiZis, duizi, 2);
			}
		}
		let result = [];
		let DanPaiResult = [];
		let DZResult = [];
		let ResultDZ = [];
		let useDanPai = [];
		let allResults = [];
		let DZResultCount = [];
		let allResultCount = [];
		DanPai.sort((a, b) => {
			return (b.cardValue) - (a.cardValue);
		});
		let copyDanPai = this.ComTool.DeepCopy(DanPai);
		for (let i = 0; i < siZhangs.length; i++) {
			for (let j = 0; j < copyDanPai.length; j++) {
				let value = this.PokerCard.GetCardValue(siZhangs[i][0]);
				let target = this.PokerCard.GetCardValue(copyDanPai[j]);
				if (value + target == 14) {
					allResults.push([siZhangs[i], [copyDanPai[j]]]);
					useDanPai.push(copyDanPai[j]);
				}
			}
		}
		for (let i = 0; i < sanTiaos.length; i++) {
			for (let j = 0; j < copyDanPai.length; j++) {
				let value = this.PokerCard.GetCardValue(sanTiaos[i][0]);
				let target = this.PokerCard.GetCardValue(copyDanPai[j]);
				if (value + target == 14) {
					allResults.push([sanTiaos[i], [copyDanPai[j]]]);
					useDanPai.push(copyDanPai[j]);
				}
			}
		}
		for (let i = 0; i < duiZis.length; i++) {
			for (let j = 0; j < copyDanPai.length; j++) {
				let value = this.PokerCard.GetCardValue(duiZis[i][0]);
				let target = this.PokerCard.GetCardValue(copyDanPai[j]);
				if (value + target == 14) {
					allResults.push([duiZis[i], [copyDanPai[j]]]);
					useDanPai.push(copyDanPai[j]);
				}
			}
		}


		console.log("allResults", allResults);
		for (let i = 0; i < allResults.length; i++) {//[[[10,26,42],[4]],[[11, 27],[3]],[[12, 28],[2]]]
			for (let j = 0; j < allResults[i].length; j++) {//[[10,26,42],[4]],[[11, 27],[3]],[[12, 28],[2]]
				for (let k = 0; k < allResults[i][j].length; k++) {//[10,26,42],[4]
					allResultCount.push(allResults[i][j][k]);
				}
			}
		}
		for (let i = 0; i < Sortpokers.length; i++) {
			if (allResultCount.indexOf(Sortpokers[i]) < 0) {
				result.push(Sortpokers[i]);
			}
		}
		for (let i = 0; i < allResultCount.length; i++) {
			lastPokers.push(allResultCount[i]);
		}
		for (let o = 0; o < result.length; o++) {
			lastPokers.push(result[o]);
		}

		for (let i = 0; i < DanPai.length; i++) {
			if (useDanPai.indexOf(DanPai[i]) < 0) {
				DanPaiResult.push(DanPai[i]);
			}
		}
		for (let l = 0; l < DanPaiResult.length; l++) {
			for (let i = l + 1; i < DanPaiResult.length; i++) {
				let value = this.PokerCard.GetCardValue(DanPaiResult[l]);
				let target = this.PokerCard.GetCardValue(DanPaiResult[i]);
				if (value + target == 14) {
					DZResult.push([DanPaiResult[l], DanPaiResult[i]]);
				}
			}
		}
		for (let i = 0; i < DZResult.length; i++) {
			for (let j = 0; j < DZResult[i].length; j++) {
				DZResultCount.push(DZResult[i][j]);
			}
		}
		for (let i = 0; i < DanPaiResult.length; i++) {
			if (DZResultCount.indexOf(DanPaiResult[i]) < 0) {
				ResultDZ.push(DanPaiResult[i]);
			}
		}
		for (let m = 0; m < DZResultCount.length; m++) {
			lastPokers.push(DZResultCount[m]);
		}
		for (let o = 0; o < ResultDZ.length; o++) {
			lastPokers.push(ResultDZ[o]);
		}

		this.dataInfo["shouCard"] = lastPokers;
	}
}
