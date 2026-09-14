// @ts-nocheck
// Generated from the Creator 2.2.2 A3PK model. Method bodies and protocol semantics are preserved.
export type LegacyA3pkAppContext = Record<string, any>;

export class LegacyA3pkRoomSet {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyA3pkAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {

		this.JS_Name = "A3PKRoomSet";

		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.PokerCard = this.app[this.app.subGameName + "_PokerCard"]();
		this.OnReload();
		this.Log("Init");
		this.SortType = 1;  //1.从大到小， 2.张数牌型
  }

  public OnReload() {
		this.dataInfo = {};
  }

  public InitSetInfo(setInfo) {
		console.log('InitSetInfo', setInfo);

		this.dataInfo = setInfo;
  }


	//-----------------------回调函数-----------------------------
  public OnInitRoomSetData(setInfo) {
		this.InitSetInfo(setInfo);
		let state = this.dataInfo["state"];

		if (this.ShareDefine.SetStateStringDict.hasOwnProperty(state)) {
			this.dataInfo["state"] = this.ShareDefine.SetStateStringDict[state];
		}
		else {
			// this.ErrLog("OnInitRoomSetData state:%s not find", state);
		}
		this.Log("OnInitRoomSetData:", this.dataInfo);
  }

  public OnSetStart(setInfo) {
		this.InitSetInfo(setInfo);
		this.dataInfo["state"] = this.ShareDefine.SetState_Playing;
  }

  public OnSetPlaying(opPos, state) {
		this.dataInfo["opPos"] = opPos;
		this.dataInfo["state"] = state;
  }

  public OnSetEnd(setEnd) {
		this.dataInfo["setEnd"] = setEnd;
		this.dataInfo["state"] = this.ShareDefine.SetState_End;
  }
  public OnStartRound(setRound) {
		let waitID = setRound["waitID"];
		let startWaitSec = setRound["startWaitSec"];
		let opPosList = setRound["opPosList"];
		this.dataInfo["setRound"] = setRound;
  }
  public UpdatePoint(info) {
		let setPosList = info.setPosList;
		for (let i = 0; i < setPosList.length; i++) {
			let posID = setPosList[i].posID;
			this.dataInfo["setPosList"][posID].prizePoint = setPosList[i].prizePoint;
			this.dataInfo["setPosList"][posID].k510Point = setPosList[i].k510Point;
			this.dataInfo["setPosList"][posID].ranksType = setPosList[i].ranksType;
		}
  }
  public OnOpCard(opInfo) {
		this.dataInfo["setPosList"][opInfo.pos] = opInfo.set_Pos;
  }
  public OnOpCardEX(opInfo) {
		this.dataInfo.isSetEnd = opInfo.isSetEnd;
		if (opInfo.turnEnd) {
			if (!opInfo.isSetEnd) {
				this.dataInfo.turnScore = 0;
			}
		}
  }
  public OnRandomPartner(info) {
		this.dataInfo["randomPartnerCard"] = info.randomPartnerCard;
  }
  public OnPartner(serverPack) {
		let challengePos = serverPack["challengePos"];//独打的位置设置 ranksType=1
		let partnerPos = serverPack["partnerPos"];//伙伴位置
		let pos = serverPack["posId"];//自己位置
		let isRed = serverPack["isRed"];//红方为1，蓝方为2
		let posInfo = this.dataInfo["setPosList"];
		if (challengePos > -1) {
			for (let i = 0; i < posInfo.length; i++) {
				let setPos = posInfo[i];
				let posID = setPos["posID"];
				if (challengePos == posID) {
					setPos["ranksType"] = 1;
				} else {
					setPos["ranksType"] = 2;
				}
			}
		} else {
			for (let i = 0; i < posInfo.length; i++) {
				let setPos = posInfo[i];
				let posID = setPos["posID"];
				if (isRed) {// 自己是红方
					if (posID == pos || posID == partnerPos) {
						setPos["ranksType"] = 1;
					} else {
						setPos["ranksType"] = 2;
					}
				} else {//自己是蓝方
					if (posID == pos || posID == partnerPos) {
						setPos["ranksType"] = 2;
					} else {
						setPos["ranksType"] = 1;
					}
				}
			}
		}
  }
	//----------------获取接口--------------------
  public OnSeeCard(info) {
		this.dataInfo["seePosId"]=info.pos;
  }
	//获取set属性值
  public GetRoomSetProperty(property) {
		if (!this.dataInfo.hasOwnProperty(property)) {
			this.ErrLog("GetSetProperty(%s) not find", property);
			return
		}
		return this.dataInfo[property];
  }

  public SetRoomSetProperty(property, value) {
		if (!this.dataInfo.hasOwnProperty(property)) {
			this.ErrLog("SetSetProperty(%s) not find", property);
			return;
		}
		this.dataInfo[property] = value;
  }

  public GetRoomSetInfo() {
		return this.dataInfo;
  }

  public GetSortType() {
		return this.SortType;
  }
  public SetSortType(SortType) {
		this.SortType = SortType;
  }

  public GetLiPais() {
		let posInfo = this.dataInfo["setPosList"];
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				return posInfo[i]['liPais'];
			}
		}
		return [];
  }
  public SetLiPais(lipais) {
		let posInfo = this.dataInfo["setPosList"];
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				posInfo[i]['liPais'] = lipais;
			}
		}
  }

  public existChallenge() {
		let posInfo = this.dataInfo["setPosList"];
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				return posInfo[i]['existChallenge'];
			}
		}
  }

  public SetChallenge() {
		let posInfo = this.dataInfo["setPosList"];
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				posInfo[i]['existChallenge']=false;
				break;
			}
		}
  }

  public UpdateHandCard(handCard, lipais) {
		let posInfo = this.dataInfo["setPosList"];
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				posInfo[i]['shouCard'] = handCard;
				posInfo[i]['liPais'] = lipais;
			}
		}
  }

  public GetPosHandCard(datapos) {
		let posInfo = this.dataInfo["setPosList"];
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].posID == datapos) {
				if (this.SortType == 1) {
					return this.SortCardByMax(posInfo[i]['shouCard']);
				} else if (this.SortType == 2) {
					return this.SortCardByNum(posInfo[i]['shouCard']);
				}
			}
		}
		return [];
  }
  public GetNoSortHandCard() {
		let posInfo = this.dataInfo["setPosList"];
		let privateCards = [];
		let clientPos = -1;
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				clientPos = i;
				privateCards = posInfo[i]['shouCard'];
				break;
			}
		}
		return privateCards;
  }

  public GetHandCard(all = 0) {
		let posInfo = this.dataInfo["setPosList"];
		let privateCards = [];
		let clientPos = -1;
		for (let i = 0; i < posInfo.length; i++) {
			if (posInfo[i].pid == this.app[this.app.subGameName + "_HeroManager"]().GetHeroProperty("pid")) {
				clientPos = i;
				if(this.SortType==1){
					privateCards = this.SortCardByMax(posInfo[i]['shouCard']);
				}else{
					privateCards = this.SortCardByNum(posInfo[i]['shouCard']);
				}
				break;
			}
		}
		//重新排序
		let liPais = this.GetLiPais(clientPos);
		if (liPais.length > 0) {
			let newPrivateCards = [];
			let newCardsEXLiPais = [];
			let newSortCards = [];
			for (let i = 0; i < liPais.length; i++) {
				let newLiPai = this.SortLiPai(liPais[i]);
				for (let j = 0; j < newLiPai.length; j++) {
					newPrivateCards.push(newLiPai[j]);
					// newPrivateCards.push(liPais[i][j]);
				}
			}
			for (let i = 0; i < privateCards.length; i++) {//移除手牌中理牌的牌
				if (newPrivateCards.indexOf(privateCards[i]) == -1) {
					newCardsEXLiPais.push(privateCards[i]);
				}
			}
			//进行牌排序
			//合并所有的牌牌
			if(this.SortType==1){
				newSortCards = this.SortCardByMax(newCardsEXLiPais);
			}else{
				newSortCards = this.SortCardByNum(newCardsEXLiPais);
			}



			for (let i = 0; i < newSortCards.length; i++) {
				newPrivateCards.push(newSortCards[i]);
			}
			return newPrivateCards; //重新理牌的排数
		}
		return privateCards;
  }


  public SortCardByNum(pokers) {
		let LaiZi = [];
		let GuiPai = [];
		let NewPai = [];
		let _t = this;
		let countList = new Array();
		for (let i = 0; i < pokers.length; i++) {
			// let cardColor = this.PokerCard.GetCardColor(pokers[i]);
			let cardValue = this.PokerCard.GetCardValue(pokers[i]);
			if (cardValue == this.PokerCard.LOGIC_MASK_LaiZi) {
				LaiZi.push(pokers[i]);
			} else if (cardValue == this.PokerCard.LOGIC_MASK_XIAOWANG ||
				cardValue == this.PokerCard.LOGIC_MASK_DAWANG) {
				GuiPai.push(pokers[i]);
			} else {
				NewPai.push(pokers[i]);
				if (countList[cardValue]) {
					countList[cardValue]['num']++;
				} else {
					countList[cardValue] = new Array();
					countList[cardValue]['num'] = 1;
					countList[cardValue]['cardValue'] = cardValue;
				}

			}
		}
		//先添加鬼牌在最左边start
		LaiZi.sort(function (a, b) {
			return (b & 0x0F) - (a & 0x0F);
		});
		//先添加鬼牌在最左边start
		GuiPai.sort(function (a, b) {
			return (b & 0x0F) - (a & 0x0F);
		});
		let Sortpokers = [];
		for (let i = 0; i < LaiZi.length; i++) {
			Sortpokers.push(LaiZi[i]);
		}
		for (let i = 0; i < GuiPai.length; i++) {
			Sortpokers.push(GuiPai[i]);
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
				if (countList[j]['num'] > 0) {
					for (let k = 0; k < NewPai.length; k++) {
						let NewPaiVal = this.PokerCard.GetCardValue(NewPai[k]);
						let countVal = countList[j]['cardValue'];
						if (NewPaiVal == countVal) {
							Sortpokers.push(NewPai[k]);
						}
					}

				}
			}
		}
		return Sortpokers;
  }
	
  public SortCardByMax(pokers) {
		let LaiZi = [];
		let GuiPai = [];
		let NewPai = [];
		let _t = this;
		for (let i = 0; i < pokers.length; i++) {
			let cardColor = this.PokerCard.GetCardColor(pokers[i]);
			let cardValue = this.PokerCard.GetCardValue(pokers[i]);
			if (cardValue == this.PokerCard.LOGIC_MASK_LaiZi) {
				LaiZi.push(pokers[i]);
			} else if (cardValue == this.PokerCard.LOGIC_MASK_XIAOWANG ||
				cardValue == this.PokerCard.LOGIC_MASK_DAWANG) {
				GuiPai.push(pokers[i]);
			} else {
				NewPai.push(pokers[i]);
			}
		}
		NewPai.sort(function (a, b) {
			let avalue = _t.PokerCard.GetCardValue(a);
			let bvalue = _t.PokerCard.GetCardValue(b);
			if (avalue == bvalue) {
				let aColor = _t.PokerCard.GetCardColor(a);
				let bColor = _t.PokerCard.GetCardColor(b);
				return bColor - aColor;
			} else {
				return bvalue - avalue;
			}

		});
		LaiZi.sort(function (a, b) {
			return (b & 0x0F) - (a & 0x0F);
		});
		GuiPai.sort(function (a, b) {
			return (b & 0x0F) - (a & 0x0F);
		});
		let Sortpokers = [];
		for (let i = 0; i < LaiZi.length; i++) {
			Sortpokers.push(LaiZi[i]);
		}
		for (let i = 0; i < GuiPai.length; i++) {
			Sortpokers.push(GuiPai[i]);
		}
		for (let i = 0; i < NewPai.length; i++) {
			Sortpokers.push(NewPai[i]);
		}
		return Sortpokers;
  }
  public SortLiPai(lipai) {
		let LaiZi = [];
		let GuiPai = [];
		let NewPai = [];
		for (let i = 0; i < lipai.length; i++) {
			let poker = lipai[i];
			let cardValue = this.PokerCard.GetCardValue(poker);
			if (cardValue == this.PokerCard.LOGIC_MASK_LaiZi) {
				LaiZi.push(poker);
			} else if (cardValue == this.PokerCard.LOGIC_MASK_XIAOWANG ||
				cardValue == this.PokerCard.LOGIC_MASK_DAWANG) {
				GuiPai.push(poker);
			} else {
				NewPai.push(poker);
			}
		}
		let Sortpokers = [];

		for (let i = 0; i < NewPai.length; i++) {
			Sortpokers.push(NewPai[i]);
		}
		for (let i = 0; i < GuiPai.length; i++) {
			Sortpokers.push(GuiPai[i]);
		}
		for (let i = 0; i < LaiZi.length; i++) {
			Sortpokers.push(LaiZi[i]);
		}
		return Sortpokers;
  }
  public SortCardByMin(pokers) {
		let LaiZi = [];
		let GuiPai = [];
		let NewPai = [];
		let _t = this;
		for (let i = 0; i < pokers.length; i++) {
			// let cardColor = this.PokerCard.GetCardColor(pokers[i]);
			let cardValue = this.PokerCard.GetCardValue(pokers[i]);
			if (cardValue == this.PokerCard.LOGIC_MASK_LaiZi) {
				LaiZi.push(pokers[i]);
			} else if (cardValue == this.PokerCard.LOGIC_MASK_XIAOWANG ||
				cardValue == this.PokerCard.LOGIC_MASK_DAWANG) {
				GuiPai.push(pokers[i]);
			} else {
				NewPai.push(pokers[i]);
			}
		}

		NewPai.sort(function (a, b) {
			let avalue = _t.PokerCard.GetCardValue(a);
			let bvalue = _t.PokerCard.GetCardValue(b);
			if (avalue == bvalue) {
				let aColor = _t.PokerCard.GetCardColor(a);
				let bColor = _t.PokerCard.GetCardColor(b);
				return bColor - aColor;
			} else {
				return avalue- bvalue;
			}

		});
		LaiZi.sort(function (a, b) {
			return (a & 0x0F) - (b & 0x0F);
		});
		GuiPai.sort(function (a, b) {
			return (a & 0x0F) - (b & 0x0F);
		});
		let Sortpokers = [];
		for (let i = 0; i < NewPai.length; i++) {
			Sortpokers.push(NewPai[i]);
		}
		for (let i = 0; i < LaiZi.length; i++) {
			Sortpokers.push(LaiZi[i]);
		}
		for (let i = 0; i < GuiPai.length; i++) {
			Sortpokers.push(GuiPai[i]);
		}
		/*console.log("GuiPai", GuiPai);
		console.log("NewPai", NewPai);
		console.log("Sortpokers", Sortpokers);*/
		return Sortpokers;
  }
}
