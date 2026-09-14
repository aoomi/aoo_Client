// @ts-nocheck
// Generated from the Creator 2.2.2 AYCP room model; method bodies and protocol semantics are preserved.
export type LegacyAycpAppContext = Record<string, any>;
export class LegacyAycpRoomPositionManager {
  public Log: (...args: any[]) => void = () => undefined;
  public ErrLog: (...args: any[]) => void = () => undefined;
  public constructor(private readonly app: LegacyAycpAppContext) { this.Init(); }


	/**
	 * 初始化
	 */
  public Init() {
		this.JS_Name = "AYDSSRoomPosMgr";
		this.ComTool = this.app[this.app.subGameName + "_ComTool"]();
		this.ShareDefine = this.app[this.app.subGameName + "_ShareDefine"]();
		this.WeChatManager = this.app[this.app.subGameName + "_WeChatManager"]();
		this.HeroManager = this.app[this.app.subGameName + "_HeroManager"]();
		this.OnReload();
		this.Log("Init");
  }

  public OnReload() {
		this.dataInfo = {};
		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;
  }

	//-----------------------回调函数-----------------------------
  public OnInitRoomPosData(roomPosInfoList) {
		this.dataInfo = {};
		this.clientPos = -1;
		this.downPos = -1;
		this.upPos = -1;
		this.facePos = -1;

		let heroImageUrlDict = {};
		let heroID = this.HeroManager.GetHeroID();
		let count = roomPosInfoList.length;

		for (let index = 0; index < count; index++) {
			let roomPosInfo = roomPosInfoList[index];
			let pos = roomPosInfo["pos"];
			this.dataInfo[pos] = roomPosInfo;
			let pid = roomPosInfo["pid"];
			let headImageUrl = roomPosInfo["headImageUrl"];
			if (pid == heroID) {
				this.clientPos = pos;
			}
			if (pid && headImageUrl) {
				heroImageUrlDict[pid] = headImageUrl;
			}
			this.WeChatManager.InitHeroHeadImage(pid, headImageUrl);
		}
		if (this.clientPos < 0) {
			console.error("OnInitRoomPosData clientPos not find");
		} else {
			let posCount = 4;
			if (count == 2) {
				this.facePos = this.clientPos == 0 ? 1 : 0;
			} else if (count == 3) {
				this.upPos = (this.clientPos + count - 1) % count;
				this.downPos = (this.clientPos + 1) % count;
			} else {
				this.upPos = (this.clientPos + posCount - 1) % posCount;
				this.downPos = (this.clientPos + 1) % posCount;
				this.facePos = (this.clientPos + 2) % posCount;
			}
			this.Log("upPos(%s) clientPos(%s) downPos(%s) facePos(%s)", this.upPos, this.clientPos, this.downPos, this.facePos);
		}
		this.Log("OnInitRoomPosData:", this.dataInfo)
  }

  public OnPosLeave(pos) {
		let playerInfo = this.dataInfo[pos];
		if (!playerInfo) {
			console.error("OnPosLeave not find:%s", pos);
			return;
		}
		playerInfo["isLostConnect"] = 0;
		playerInfo["pid"] = 0;
		playerInfo["name"] = 0;
		playerInfo["roomReady"] = false;
		playerInfo["gameReady"] = false;
		playerInfo["giveUpGame"] = 0;
		playerInfo["point"] = 0;
		playerInfo["flashCnt"] = 0;
		playerInfo["paiPin"] = 0;
		playerInfo["up"] = 0;
		playerInfo["down"] = 0;
  }
  public OnPosOpCard(serverPack) {
		let isFlash = serverPack["isFlash"];
		let pos = serverPack["pos"];
		let falshCnt = this.dataInfo[pos]["flashCnt"];
		if (isFlash) {
			falshCnt++;
			this.dataInfo[pos]["flashCnt"] = falshCnt;
		}
  }
	//座位信息更新
  public OnPosUpdate(pos, posInfo) {
		let playerInfo = this.dataInfo[pos];
		if (!playerInfo) {
			this.Log("OnPosUpdate not find:%s", pos);
			return false;
		}
		this.dataInfo[pos] = posInfo;
		let heroID = posInfo["pid"];
		let headImageUrl = posInfo["headImageUrl"];
		if (heroID && headImageUrl) {
			this.WeChatManager.InitHeroHeadImage(heroID, headImageUrl);
		}
		return true;
  }

	//开局准备
  public OnPosReadyChg(pos, roomReady) {
		let playerInfo = this.dataInfo[pos];
		if (!playerInfo) {
			this.Log("OnPosReadyChg not find:%s", pos);
			return false;
		}
		playerInfo["roomReady"] = roomReady;
		return true;
  }

	//准备下一句
  public OnPosContinueGame(pos) {
		let playerInfo = this.dataInfo[pos];
		if (!playerInfo) {
			console.error("OnPosContinueGame not find:%s", pos);
			return
		}
		playerInfo["gameReady"] = true;
  }

  public OnSetEnd(setEnd) {
		let posHuList = setEnd["posResultList"];
		//清除准备状态
		for (let pos in this.dataInfo) {
			let playerInfo = this.dataInfo[pos];
			playerInfo["point"] += posHuList[pos]["point"];
			playerInfo["gameReady"] = false;
			this.dataInfo[pos]['point'] = playerInfo["point"];

			playerInfo["clubCent"] += posHuList[pos]["clubCent"];
			this.dataInfo[pos]["clubCent"] = playerInfo["clubCent"];
		}
  }

  public OnSetSportPoint(setInfo) {
		let posHuList = setInfo["setPosList"];
		//清除准备状态
		for (let pos in this.dataInfo) {
			if (!this.dataInfo[pos]["clubCent"]) {
				this.dataInfo[pos]["clubCent"] = 0;
			}
			this.dataInfo[pos]["clubCent"] = posHuList[pos]["clubCent"];
		}
  }
  public GetPosReady(pos) {
		console.log("GetPosReady:"+pos);
		return this.dataInfo[pos]["isPosReady"];
  }
	//-------------------------获取接口---------------------
	//获取客户端玩家准备状态
  public GetPlayerReadyState(roomSetID) {
		let ReadyState = "";
		if (roomSetID > 0) {
			ReadyState = "gameReady";
		} else {
			ReadyState = "roomReady";
		}
		return this.GetPlayerInfoByPos(this.clientPos)[ReadyState];
  }

	//设置玩家离线状态
  public SetPlayerOfflineState(pos, isLostConnect) {
		if (!this.dataInfo.hasOwnProperty(pos)) {
			console.error("SetPlayerOfflineState not find:%s", pos);
			return;
		}
		this.dataInfo[pos]["isLostConnect"] = isLostConnect;
  }
  public GetPlayerOfflinePosByPid(pid) {
		for (let pos in this.dataInfo) {
			let playerInfo = this.dataInfo[pos];
			if (playerInfo["pid"] == pid) {
				return playerInfo["pos"];
			}
		}
		return -1;
  }

	//获取房间所有玩家信息
  public GetRoomAllPlayerInfo() {
		return this.dataInfo;
  }
	//获取房间有几个玩家
  public GetRoomPlayerCount() {
		let count = 0;
		if (this.clientPos > -1) {
			count++;
		}
		if (this.downPos > -1) {
			count++;
		}
		if (this.upPos > -1) {
			count++;
		}
		if (this.facePos > -1) {
			count++;
		}
		return count;
  }
	//获取房间指定位置玩家信息
  public GetPlayerInfoByPos(pos) {
		if (!this.dataInfo.hasOwnProperty(pos)) {
			console.error("GetPlayerInfoByPos(%s) not find", pos);
			return;
		}
		return this.dataInfo[pos];
  }
  public onPosTotalJifen(posList) {
		for (let idx = 0; idx < posList.length; idx++) {
			let player = posList[idx];
			let playerInfo = this.dataInfo[player.pos];
			if (!playerInfo) {
				this.Log("onPosTotalJifen not find:%s", pos);
				return false
			}
			playerInfo.point = player.point;
		}
  }
  public OnClubCentChange(serverPack) {
		//同步更新竞技点
		console.log("同步更新竞技点", serverPack);
		for (let pos in this.dataInfo) {
			let playerInfo = this.dataInfo[pos];
			if (pos == serverPack.posId &&
				playerInfo.pid == serverPack.pid) {
				let sp = parseFloat(playerInfo["clubCent"]).toFixed(2);
				let addSp = parseFloat(serverPack.clubCent).toFixed(2);
				let totalSp = parseFloat(sp) + parseFloat(addSp);
				//保留小数点后面两位
				playerInfo["clubCent"] = totalSp.toFixed(2);
				this.dataInfo[pos]["clubCent"] = totalSp.toFixed(2);
			}
		}
  }
	//获取房间指定位置玩家信息
  public GetPlayerClubCentByPos(pos) {
		if (!this.dataInfo.hasOwnProperty(pos)) {
			console.error("GetPlayerClubCentByPos(%s) not find", pos);
			return;
		}
		return this.dataInfo[pos]["clubCent"];
  }

	//获取房间指定位置玩家信息
  public GetPlayerReadyByPos(pos) {
		if (!this.dataInfo.hasOwnProperty(pos)) {
			console.error("GetPlayerInfoByPos(%s) not find", pos);
			return;
		}
		return this.dataInfo[pos]["roomReady"];
  }

	//获取客户端玩家的座位
  public GetClientPos() {
		return this.clientPos;
  }

	//获取客户端玩家的上家位置ID
  public GetClientUpPos() {
		return this.upPos;
  }

	//获取客户端玩家下家位置ID
  public GetClientDownPos() {
		return this.downPos;
  }

	//获取客户端玩家对家位置ID
  public GetClientFacePos() {
		return this.facePos;
  }
  public GetPlayerPidByPos(pos) {
		return this.dataInfo[pos]["pid"];
  }
  public GetUIPosByDataPos(dataPos) {
		let player = this.GetPlayerInfoByPos(dataPos);
		let clientPos = this.GetClientPos();
		let downPos = this.GetClientDownPos();
		let facePos = this.GetClientFacePos();
		let upPos = this.GetClientUpPos();
		if (player["pos"] == clientPos) {
			return 0;
		} else if (player["pos"] == downPos) {
			return 1;
		} else if (player["pos"] == facePos) {
			return 2;
		} else if (player["pos"] == upPos) {
			return 3;
		} else {
			return -1;
		}
	}
}
